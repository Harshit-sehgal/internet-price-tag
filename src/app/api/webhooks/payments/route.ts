import { recordPaymentEvent, markPaymentEventStatus } from "@/lib/repo";
import { getPaymentProvider } from "@/lib/payments";
import { processSucceededPayment } from "@/lib/takeover";

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
    if (result.outcome === "processed" || result.outcome === "duplicate") {
      await markPaymentEventStatus(provider.name, event.id, "processed");
    } else if (result.outcome === "failed") {
      await markPaymentEventStatus(
        provider.name,
        event.id,
        result.refunded ? "processed" : "error",
        result.reason,
      );
    }
    return Response.json({ received: true, result });
  }

  // failed / refunded / other events: recorded for observability, no action.
  await markPaymentEventStatus(provider.name, event.id, "ignored", event.type);
  return Response.json({ received: true, ignored: event.type });
}
