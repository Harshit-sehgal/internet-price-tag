// Takeover orchestration: the single trusted path from payment to holder change.
// Server-only. Combines quotes, payments and the atomic database finalizer.
import "server-only";
import { getQuote, finalizeTakeover, getProfileById, markQuoteStatus, markPaymentEventStatus, type RepoQuote, type TakeoverOutcome } from "./repo.ts";

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
  if (!args.quoteId) return { outcome: "ignored", reason: "missing_quote_metadata" };

  const quote = await getQuote(args.quoteId);
  if (!quote) return { outcome: "ignored", reason: "unknown_quote" };
  if (quote.status === "consumed") {
    // Idempotent replay of an already-applied payment.
    return { outcome: "duplicate", reason: "quote_already_consumed" };
  }
  if (new Date(quote.expiresAt).getTime() < Date.now()) {
    await markQuoteStatus(quote.id, "expired");
    return { outcome: "ignored", reason: "quote_expired" };
  }

  const profile = await getProfileById(quote.buyerUserId);
  if (!profile) return { outcome: "failed", reason: "buyer_profile_missing" };
  if (profile.suspendedAt) return { outcome: "failed", reason: "buyer_suspended" };

  if (args.paidCents != null && args.paidCents !== quote.nextPriceCents) {
    // Never apply a payment toward a different price (§50).
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
    return { outcome: "processed", saleId: outcome.sale.id };
  }

  if (outcome.code === "STALE_QUOTE") {
    await markQuoteStatus(quote.id, "stale");
    const refunded = await refundWithLog(args.provider, args.eventId, args.paymentId, quote, "stale_quote");
    return { outcome: "failed", refunded, reason: "stale_quote" };
  }
  if (outcome.code === "WRONG_PRICE") {
    const refunded = await refundWithLog(args.provider, args.eventId, args.paymentId, quote, "wrong_price");
    return { outcome: "failed", refunded, reason: "wrong_price" };
  }
  if (outcome.code === "ALREADY_HOLDER") {
    const refunded = await refundWithLog(args.provider, args.eventId, args.paymentId, quote, "already_holder");
    return { outcome: "failed", refunded, reason: "already_holder" };
  }
  // IDEMPOTENCY_CONFLICT / FINALIZE_ERROR: leave payment events for operator alert (§56).
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
      await markPaymentEventStatus(provider, eventId, "error", `refund_failed: ${res.error}`);
      return false;
    }
    return true;
  } catch {
    await markPaymentEventStatus(provider, eventId, "error", "refund_failed: provider_error");
    return false;
  }
}
