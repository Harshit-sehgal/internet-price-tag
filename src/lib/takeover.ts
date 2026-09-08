// Takeover orchestration: the single trusted path from payment to holder change.
// Server-only. Combines quotes, payments and the atomic database finalizer.
import "server-only";
import { getQuote, finalizeTakeover, getProfileById, markQuoteStatus, markPaymentEventStatus, type RepoQuote, type TakeoverOutcome } from "./repo.ts";
import { logEvent } from "./logger.ts";

export type WebhookProcessingResult = {
  outcome: "processed" | "ignored" | "duplicate" | "failed";
  saleId?: string;
  refunded?: boolean;
  reason?: string;
};

export async function processSucceededPayment(args: {
  provider: string;
  eventId: string;
  paymentId: string;
  quoteId: string | null;
  paidCents: number | null;
}): Promise<WebhookProcessingResult> {
  if (!args.quoteId) {
    logEvent("webhook_payment_missing_quote", "warn", { provider: args.provider, event_id: args.eventId, payment_id: args.paymentId });
    return { outcome: "ignored", reason: "missing_quote_metadata" };
  }

  const quote = await getQuote(args.quoteId);
  if (!quote) {
    logEvent("webhook_payment_unknown_quote", "warn", { provider: args.provider, event_id: args.eventId, payment_id: args.paymentId, quote_id: args.quoteId });
    return { outcome: "ignored", reason: "unknown_quote" };
  }
  if (quote.status === "consumed") {
    // Idempotent replay of an already-applied payment.
    return { outcome: "duplicate", reason: "quote_already_consumed" };
  }
  if (new Date(quote.expiresAt).getTime() < Date.now()) {
    await markQuoteStatus(quote.id, "expired");
    return { outcome: "ignored", reason: "quote_expired" };
  }

  const profile = await getProfileById(quote.buyerUserId);
  if (!profile) {
    logEvent("takeover_failed_buyer_profile_missing", "error", { provider: args.provider, payment_id: args.paymentId, quote_id: quote.id });
    return { outcome: "failed", reason: "buyer_profile_missing" };
  }
  if (profile.suspendedAt) {
    logEvent("takeover_blocked_buyer_suspended", "warn", { provider: args.provider, payment_id: args.paymentId, quote_id: quote.id });
    return { outcome: "failed", reason: "buyer_suspended" };
  }

  if (args.paidCents != null && args.paidCents !== quote.nextPriceCents) {
    // Never apply a payment toward a different price (§50).
    logEvent("payment_amount_mismatch", "error", { provider: args.provider, payment_id: args.paymentId, quote_id: quote.id, paid_cents: args.paidCents, expected_cents: quote.nextPriceCents });
    await refundWithLog(args.provider, args.eventId, args.paymentId, quote, "amount_mismatch");
    return { outcome: "failed", refunded: true, reason: "amount_mismatch" };
  }

  const outcome: TakeoverOutcome = await finalizeTakeover({
    domain: quote.domain,
    buyerUserId: quote.buyerUserId,
    buyerHandle: profile.handle,
    expectedVersion: quote.expectedVersion,
    paidCents: args.paidCents ?? quote.nextPriceCents,
    providerPaymentId: args.paymentId,
  });

  if (outcome.ok) {
    await markQuoteStatus(quote.id, "consumed");
    logEvent("takeover_succeeded", "info", { provider: args.provider, payment_id: args.paymentId, quote_id: quote.id, domain: quote.domain, price_cents: outcome.sale.priceCents, buyer: outcome.sale.buyerHandle, sale_id: outcome.sale.id });
    return { outcome: "processed", saleId: outcome.sale.id };
  }

  if (outcome.code === "STALE_QUOTE") {
    await markQuoteStatus(quote.id, "stale");
    logEvent("payment_succeeded_takeover_stale", "warn", { provider: args.provider, payment_id: args.paymentId, quote_id: quote.id, domain: quote.domain });
    const refunded = await refundWithLog(args.provider, args.eventId, args.paymentId, quote, "stale_quote");
    return { outcome: "failed", refunded, reason: "stale_quote" };
  }
  if (outcome.code === "WRONG_PRICE") {
    logEvent("payment_wrong_price", "error", { provider: args.provider, payment_id: args.paymentId, quote_id: quote.id });
    const refunded = await refundWithLog(args.provider, args.eventId, args.paymentId, quote, "wrong_price");
    return { outcome: "failed", refunded, reason: "wrong_price" };
  }
  if (outcome.code === "ALREADY_HOLDER") {
    logEvent("payment_already_holder", "warn", { provider: args.provider, payment_id: args.paymentId, quote_id: quote.id });
    const refunded = await refundWithLog(args.provider, args.eventId, args.paymentId, quote, "already_holder");
    return { outcome: "failed", refunded, reason: "already_holder" };
  }
  // IDEMPOTENCY_CONFLICT / FINALIZE_ERROR: critical alert condition (§56).
  logEvent("takeover_finalization_error", "error", { provider: args.provider, payment_id: args.paymentId, quote_id: quote.id, code: outcome.code });
  return { outcome: "failed", reason: outcome.code };
}

async function refundWithLog(
  provider: string,
  eventId: string,
  paymentId: string,
  quote: RepoQuote,
  reason: string,
): Promise<boolean> {
  try {
    const { getPaymentProvider } = await import("./payments.ts");
    const providerImpl = getPaymentProvider();
    const res = await providerImpl.refundPayment(paymentId, reason);
    if (!res.ok) {
      // Refund failed on a payment we will never apply: critical (§56).
      logEvent("refund_failed", "error", { provider, payment_id: paymentId, quote_id: quote.id, reason, detail: res.error });
      await markPaymentEventStatus(provider, eventId, "error", `refund_failed: ${res.error}`);
      return false;
    }
    logEvent("stale_payment_refunded", "info", { provider, payment_id: paymentId, quote_id: quote.id, reason });
    return true;
  } catch (e) {
    logEvent("refund_failed", "error", { provider, payment_id: paymentId, quote_id: quote.id, reason, detail: e instanceof Error ? e.message : String(e) });
    await markPaymentEventStatus(provider, eventId, "error", "refund_failed: provider_error");
    return false;
  }
}
