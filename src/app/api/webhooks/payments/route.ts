import { recordPaymentEvent, markPaymentEventStatus } from "@/lib/repo";
import { getPaymentProvider } from "@/lib/payments";
import { processSucceededPayment } from "@/lib/takeover";
import { logEvent } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * Signed webhook endpoint. Redirects are never proof of payment (§24).
 * Processing is idempotent on (provider, event id) and on payment id via the
 * sales unique constraint inside finalize_takeover.
 */
export async function POST(req: Request) {
  const provider = getPaymentProvider();
  const raw = await req.text(); // raw body required for signature verification
  const signature =
    req.headers.get("stripe-signature") ?? req.headers.get("x-demo-signature") ?? null;

  const verification = provider.verifyWebhook(raw, signature);
  if (!verification.ok) {
    logEvent("webhook_signature_invalid", "warn", { provider: provider.name, reason: verification.reason });
    return Response.json({ error: "invalid_signature", reason: verification.reason }, { status: 400 });
  }

  const event = verification.event;

  // Event-level idempotency: duplicate deliveries are recorded once.
  try {
    await recordPaymentEvent({
      provider: provider.name,
      providerEventId: event.id,
      providerPaymentId: event.paymentId,
      eventType: event.type,
      status: "received",
    });
  } catch (e) {
    // Unique violation => we already processed this event id.
    logEvent("webhook_duplicate_event", "info", { provider: provider.name, event_id: event.id });
    return Response.json({ received: true, duplicate: true, detail: String(e) });
  }

  if (event.status === "succeeded") {
    const result = await processSucceededPayment({
      provider: provider.name,
      eventId: event.id,
      paymentId: event.paymentId,
      quoteId: event.quoteId,
      paidCents: event.amountCents,
    });
    if (result.outcome === "processed") {
      await markPaymentEventStatus(provider.name, event.id, "processed");
    } else if (result.outcome === "duplicate") {
      // Stripe retries with the same event id already short-circuited at
      // recordPaymentEvent; this path is a different event id for the same
      // paymentId that finalizeTakeover resolved idempotently. Still a
      // successful delivery — do not surface as webhook error.
      await markPaymentEventStatus(provider.name, event.id, "processed", result.reason);
    } else if (result.outcome === "failed") {
      // Refunded paths (stale/expired/unknown/wrong_price/already_holder/
      // FINALIZE_ERROR) are successful webhook processing — the money was
      // returned, not lost. Only non-refunded failures surface as error.
      // "ignored" statuses on quote_expired / unknown_quote are kept as
      // "ignored" so observability queries can distinguish the class.
      const ignoredRefundReasons = new Set(["quote_expired", "missing_quote_metadata", "unknown_quote"]);
      const isIgnoredRefund =
        result.reason !== undefined && ignoredRefundReasons.has(result.reason) && Boolean(result.refunded);
      await markPaymentEventStatus(
        provider.name,
        event.id,
        result.refunded ? (isIgnoredRefund ? "ignored" : "processed") : "error",
        result.reason,
      );
    } else if (result.outcome === "ignored") {
      // Fallback: legacy ignored outcomes (should be failed with refund now).
      await markPaymentEventStatus(provider.name, event.id, "ignored", result.reason);
    }
    return Response.json({ received: true, result });
  }

  // failed / refunded / other events: recorded for observability, no action.
  await markPaymentEventStatus(provider.name, event.id, "ignored", event.type);
  return Response.json({ received: true, ignored: event.type });
}
