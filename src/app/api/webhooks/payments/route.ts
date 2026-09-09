import { recordPaymentEvent, markPaymentEventStatus } from "@/lib/repo";
import { getPaymentProvider } from "@/lib/payments";
import { processSucceededPayment } from "@/lib/takeover";
import { logEvent } from "@/lib/logger";
import { isUniqueViolation } from "@/lib/db-errors";

export const dynamic = "force-dynamic";

/**
 * Signed webhook endpoint. Redirects are never proof of payment (§24).
 * Processing is idempotent on (provider, event id) and on payment id via the
 * sales unique constraint inside finalize_takeover.
 *
 * Retry contract (provider-agnostic, required for Dodo):
 * - 200 = terminally handled (processed / duplicate / refunded / intentional
 *   ignore). The provider must NOT retry.
 * - 500 = transient failure (DB outage, refund-provider outage). The provider
 *   MUST retry the delivery.
 * Only a unique-constraint violation on payment_events is treated as a
 * duplicate; every other DB error returns 500.
 */
export async function POST(req: Request) {
  const provider = getPaymentProvider();
  const raw = await req.text(); // raw body required for signature verification
  const signature =
    req.headers.get("stripe-signature") ??
    req.headers.get("dodo-signature") ??
    req.headers.get("webhook-signature") ??
    req.headers.get("x-demo-signature") ??
    null;

  // Standard Webhooks (Dodo) carries the event id + timestamp as headers.
  const verification = provider.verifyWebhook(raw, signature, {
    webhookId: req.headers.get("webhook-id"),
    webhookTimestamp: req.headers.get("webhook-timestamp"),
  });
  if (!verification.ok) {
    logEvent("webhook_signature_invalid", "warn", { provider: provider.name, reason: verification.reason });
    return Response.json({ error: "invalid_signature", reason: verification.reason }, { status: 400 });
  }

  const event = verification.event;

  // Event-level idempotency: duplicate deliveries are recorded once.
  // ONLY a unique violation means "already seen". Any other DB error is a
  // real failure and must return 500 so the provider retries.
  try {
    await recordPaymentEvent({
      provider: provider.name,
      providerEventId: event.id,
      providerPaymentId: event.paymentId,
      eventType: event.type,
      status: "received",
    });
  } catch (e) {
    if (!isUniqueViolation(e)) {
      logEvent("webhook_store_failed", "error", {
        provider: provider.name,
        event_id: event.id,
        detail: e instanceof Error ? e.message : String(e),
      });
      return Response.json({ error: "store_failed", retryable: true }, { status: 500 });
    }
    logEvent("webhook_duplicate_event", "info", { provider: provider.name, event_id: event.id });
    return Response.json({ received: true, duplicate: true });
  }

  if (event.status === "succeeded") {
    let result: Awaited<ReturnType<typeof processSucceededPayment>>;
    try {
      result = await processSucceededPayment({
        provider: provider.name,
        eventId: event.id,
        paymentId: event.paymentId,
        quoteId: event.quoteId,
        paidCents: event.amountCents,
      });
    } catch (e) {
      // DB outage / unexpected throw mid-processing: leave the event as
      // "received" and ask the provider to retry.
      logEvent("webhook_processing_failed", "error", {
        provider: provider.name,
        event_id: event.id,
        detail: e instanceof Error ? e.message : String(e),
      });
      try {
        await markPaymentEventStatus(provider.name, event.id, "error", "processing_exception");
      } catch {
        // Status write itself failed — still 500 so the provider retries.
      }
      return Response.json({ error: "processing_failed", retryable: true }, { status: 500 });
    }

    if (result.outcome === "processed") {
      try {
        await markPaymentEventStatus(provider.name, event.id, "processed");
      } catch (e) {
        // Sale is committed but the observability write failed. The money
        // state is deterministic; return 500 so a duplicate delivery
        // idempotently converges the status row via the sales lookup.
        logEvent("webhook_store_failed", "error", { provider: provider.name, event_id: event.id, detail: e instanceof Error ? e.message : String(e) });
        return Response.json({ error: "store_failed", retryable: true }, { status: 500 });
      }
      return Response.json({ received: true, result });
    }

    if (result.outcome === "duplicate") {
      // A different event id for the same paymentId that finalizeTakeover
      // resolved idempotently. Successful delivery — do not retry.
      try {
        await markPaymentEventStatus(provider.name, event.id, "processed", result.reason);
      } catch (e) {
        logEvent("webhook_store_failed", "error", { provider: provider.name, event_id: event.id, detail: e instanceof Error ? e.message : String(e) });
        return Response.json({ error: "store_failed", retryable: true }, { status: 500 });
      }
      return Response.json({ received: true, result });
    }

    if (result.outcome === "failed") {
      // IDEMPOTENCY_CONFLICT must NOT be refunded (the payment already funded
      // its original sale) and must NOT be retried. Ack + alert.
      if (result.reason === "IDEMPOTENCY_CONFLICT") {
        logEvent("webhook_idempotency_conflict", "error", {
          provider: provider.name,
          event_id: event.id,
          payment_id: event.paymentId,
        });
        try {
          await markPaymentEventStatus(provider.name, event.id, "error", result.reason);
        } catch {
          return Response.json({ error: "store_failed", retryable: true }, { status: 500 });
        }
        return Response.json({ received: true, result });
      }
      // A failed refund (or any failed path with refunded === false) leaves
      // money in a non-deterministic state → 500 so the provider retries and
      // the next delivery re-attempts finalize + refund.
      if (!result.refunded) {
        try {
          await markPaymentEventStatus(provider.name, event.id, "error", result.reason);
        } catch {
          // Fall through to the 500 below.
        }
        return Response.json({ received: true, result, retryable: true }, { status: 500 });
      }
      // Refunded paths (stale/expired/unknown/wrong_price/already_holder/
      // FINALIZE_ERROR) are terminally handled — the money was returned.
      const ignoredRefundReasons = new Set(["quote_expired", "missing_quote_metadata", "unknown_quote"]);
      const isIgnoredRefund =
        result.reason !== undefined && ignoredRefundReasons.has(result.reason);
      try {
        await markPaymentEventStatus(
          provider.name,
          event.id,
          isIgnoredRefund ? "ignored" : "processed",
          result.reason,
        );
      } catch (e) {
        logEvent("webhook_store_failed", "error", { provider: provider.name, event_id: event.id, detail: e instanceof Error ? e.message : String(e) });
        return Response.json({ error: "store_failed", retryable: true }, { status: 500 });
      }
      return Response.json({ received: true, result });
    }

    // Fallback: legacy ignored outcomes.
    try {
      await markPaymentEventStatus(provider.name, event.id, "ignored", result.reason);
    } catch {
      return Response.json({ error: "store_failed", retryable: true }, { status: 500 });
    }
    return Response.json({ received: true, result });
  }

  // failed / refunded / other events: recorded for observability, no action.
  try {
    await markPaymentEventStatus(provider.name, event.id, "ignored", event.type);
  } catch {
    return Response.json({ error: "store_failed", retryable: true }, { status: 500 });
  }
  return Response.json({ received: true, ignored: event.type });
}
