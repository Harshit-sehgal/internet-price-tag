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
    const refunded = await refundWithoutQuote(args.provider, args.eventId, args.paymentId, "missing_quote_metadata");
    return { outcome: "failed", refunded, reason: "missing_quote_metadata" };
  }

  const quote = await getQuote(args.quoteId);
  if (!quote) {
    logEvent("webhook_payment_unknown_quote", "warn", { provider: args.provider, event_id: args.eventId, payment_id: args.paymentId, quote_id: args.quoteId });
    const refunded = await refundWithoutQuote(args.provider, args.eventId, args.paymentId, "unknown_quote");
    return { outcome: "failed", refunded, reason: "unknown_quote" };
  }
  // Terminal quote states must never create a sale — cover the webhook race
  // where Stripe retries arrive after we already marked the quote.
  // Note: "consumed" is intentionally excluded here — a duplicate webhook for
  // the same paymentId on a consumed quote is legitimate (Stripe retries the
  // same event) and is handled idempotently via finalizeTakeover + the
  // alreadyConsumed duplicate path below. Expiry for consumed quotes is also
  // ignored: the sale already happened, the TTL no longer matters.
  if (quote.status !== "active" && quote.status !== "checkout_created" && quote.status !== "consumed") {
    if (quote.status === "expired" || quote.status === "stale" || quote.status === "cancelled") {
      logEvent("webhook_payment_terminal_quote", "warn", {
        provider: args.provider,
        payment_id: args.paymentId,
        quote_id: quote.id,
        quote_status: quote.status,
      });
      const refunded = await refundWithLog(args.provider, args.eventId, args.paymentId, quote, `quote_${quote.status}`);
      return { outcome: "failed", refunded, reason: `quote_${quote.status}` };
    }
    logEvent("webhook_payment_terminal_quote", "warn", {
      provider: args.provider,
      payment_id: args.paymentId,
      quote_id: quote.id,
      quote_status: quote.status,
    });
    const refunded = await refundWithLog(args.provider, args.eventId, args.paymentId, quote, `quote_${quote.status}`);
    return { outcome: "failed", refunded, reason: `quote_${quote.status}` };
  }
  // Only non-consumed quotes expire — consumed quotes already produced a sale
  // and must not be refunded on TTL expiry (that would refund a valid sale).
  if (quote.status !== "consumed" && new Date(quote.expiresAt).getTime() < Date.now()) {
    await markQuoteStatus(quote.id, "expired");
    logEvent("webhook_payment_expired_quote", "warn", { provider: args.provider, payment_id: args.paymentId, quote_id: quote.id });
    const refunded = await refundWithLog(args.provider, args.eventId, args.paymentId, quote, "quote_expired");
    return { outcome: "failed", refunded, reason: "quote_expired" };
  }

  // Do not short-circuit on consumed: a duplicate webhook for the same
  // paymentId will be handled idempotently by finalizeTakeover's sales
  // lookup, while a reused quote with a new paymentId correctly becomes
  // STALE_QUOTE and is refunded.

  const profile = await getProfileById(quote.buyerUserId);
  if (!profile) {
    logEvent("takeover_failed_buyer_profile_missing", "error", { provider: args.provider, payment_id: args.paymentId, quote_id: quote.id });
    const refunded = await refundWithLog(args.provider, args.eventId, args.paymentId, quote, "buyer_profile_missing");
    return { outcome: "failed", refunded, reason: "buyer_profile_missing" };
  }
  if (profile.suspendedAt) {
    logEvent("takeover_blocked_buyer_suspended", "warn", { provider: args.provider, payment_id: args.paymentId, quote_id: quote.id });
    const refunded = await refundWithLog(args.provider, args.eventId, args.paymentId, quote, "buyer_suspended");
    return { outcome: "failed", refunded, reason: "buyer_suspended" };
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

  const alreadyConsumed = quote.status === "consumed";

  if (outcome.ok) {
    // Detect idempotent replay via sales lookup so duplicate webhooks
    // surface as duplicate rather than processed. Without this, a re-delivered
    // Stripe event would re-emit takeover_succeeded and confuse monitoring.
    // finalizeTakeover returns the same sale for the same paymentId.
    // Do not mark a duplicate delivery as consumed again — the quote already
    // is, and touching it again would be a redundant write.
    if (alreadyConsumed) {
      return { outcome: "duplicate", saleId: outcome.sale.id, reason: "quote_already_consumed" };
    }
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
  if (outcome.code === "FINALIZE_ERROR") {
    // RESERVED_DOMAIN surfaces as FINALIZE_ERROR via repo.ts; refund the stale payment.
    logEvent("takeover_finalization_error", "error", { provider: args.provider, payment_id: args.paymentId, quote_id: quote.id, code: outcome.code, domain: quote.domain });
    const refunded = await refundWithLog(args.provider, args.eventId, args.paymentId, quote, "finalize_error");
    return { outcome: "failed", refunded, reason: outcome.code };
  }
  // IDEMPOTENCY_CONFLICT: critical alert condition (§56) — mismatched reuse of a payment id.
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

async function refundWithoutQuote(
  provider: string,
  eventId: string,
  paymentId: string,
  reason: string,
): Promise<boolean> {
  try {
    const { getPaymentProvider } = await import("./payments.ts");
    const providerImpl = getPaymentProvider();
    const res = await providerImpl.refundPayment(paymentId, reason);
    if (!res.ok) {
      logEvent("refund_failed", "error", { provider, payment_id: paymentId, reason, detail: res.error });
      await markPaymentEventStatus(provider, eventId, "error", `refund_failed: ${res.error}`);
      return false;
    }
    logEvent("stale_payment_refunded", "info", { provider, payment_id: paymentId, reason, quote_id: null });
    return true;
  } catch (e) {
    logEvent("refund_failed", "error", { provider, payment_id: paymentId, reason, detail: e instanceof Error ? e.message : String(e) });
    await markPaymentEventStatus(provider, eventId, "error", "refund_failed: provider_error");
    return false;
  }
}
