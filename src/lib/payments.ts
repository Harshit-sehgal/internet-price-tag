// Payment provider abstraction (execution plan §20).
// Market logic never imports a provider SDK directly.
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { isProdDatastore } from "./repo.ts";

export type CheckoutResult = {
  checkoutUrl: string | null;
  providerPaymentId: string; // payment intent / checkout session id
  mode: "authorize" | "charge";
};

export type WebhookVerification = { ok: true; event: ProviderEvent } | { ok: false; reason: string };

export type ProviderEvent = {
  id: string;
  type: string;
  paymentId: string;
  quoteId: string | null;
  amountCents: number | null;
  status: "succeeded" | "failed" | "refunded" | "other";
};

export interface PaymentProvider {
  readonly name: string;
  createCheckout(args: {
    quoteId: string;
    domain: string;
    buyerUserId: string;
    buyerHandle: string;
    amountCents: number;
    successUrl: string;
    cancelUrl: string;
  }): Promise<CheckoutResult>;
  verifyWebhook(payload: string, signature: string | null): WebhookVerification;
  refundPayment(paymentId: string, reason: string): Promise<{ ok: boolean; error?: string }>;
}

export class ProviderNotConfiguredError extends Error {
  constructor(name: string) {
    super(`PAYMENT_PROVIDER_NOT_CONFIGURED: ${name}`);
  }
}

// ------------------------------------------------------------- demo provider
/**
 * Simulated provider for local dev / preview only. The checkout URL points at
 * /checkout/mock, which drives the same webhook path with signed payloads.
 */
class DemoProvider implements PaymentProvider {
  readonly name = "demo";
  private secret = process.env.DEMO_WEBHOOK_SECRET || "demo-webhook-secret";

  async createCheckout(args: { quoteId: string; amountCents: number; domain: string; buyerUserId: string }): Promise<CheckoutResult> {
    const params = new URLSearchParams({
      quote_id: args.quoteId,
      domain: args.domain,
      amount_cents: String(args.amountCents),
    });
    return {
      checkoutUrl: `/checkout/mock?${params.toString()}`,
      providerPaymentId: `demo_pi_${args.quoteId}`,
      mode: "charge",
    };
  }

  sign(payload: string): string {
    return createHmac("sha256", this.secret).update(payload).digest("hex");
  }

  verifyWebhook(payload: string, signature: string | null): WebhookVerification {
    if (!signature) return { ok: false, reason: "missing_signature" };
    const expected = this.sign(payload);
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "invalid_signature" };
    try {
      const body = JSON.parse(payload) as { id: string; type: string; payment_intent: string; metadata: Record<string, string> };
      const status = body.type === "payment_intent.payment_failed" ? "failed" : body.type === "charge.refunded" ? "refunded" : "succeeded";
      return {
        ok: true,
        event: {
          id: body.id,
          type: body.type,
          paymentId: body.payment_intent,
          quoteId: body.metadata?.quote_id ?? null,
          amountCents: Number(body.metadata?.amount_cents ?? 0) || null,
          status,
        },
      };
    } catch {
      return { ok: false, reason: "invalid_payload" };
    }
  }

  async refundPayment(): Promise<{ ok: boolean; error?: string }> {
    return { ok: true };
  }
}

// ------------------------------------------------------------ stripe provider
type StripeLike = {
  checkout: {
    sessions: {
      create(args: Record<string, unknown>): Promise<{ id: string; url: string | null }>;
    };
  };
  paymentIntents: {
    get(id: string): Promise<{ id: string; status: string; amount: number; metadata: Record<string, string> }>;
    refund?: never;
  };
  refunds: { create(args: { payment_intent: string; reason?: string }): Promise<{ id: string }> };
  webhooks: { constructEvent(payload: string, sig: string, secret: string): { id: string; type: string; data: { object: Record<string, unknown> } } };
};

async function loadStripe(): Promise<StripeLike> {
  const mod = (await import("stripe")) as unknown as { default: new (key: string) => StripeLike };
  return new mod.default(process.env.STRIPE_SECRET_KEY!);
}

class StripeProvider implements PaymentProvider {
  readonly name = "stripe";

  async createCheckout(args: {
    quoteId: string;
    domain: string;
    buyerUserId: string;
    buyerHandle: string;
    amountCents: number;
    successUrl: string;
    cancelUrl: string;
  }): Promise<CheckoutResult> {
    const stripe = await loadStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: args.amountCents,
            product_data: {
              name: `Take ${args.domain}`,
              description: "Temporary symbolic holder status on The Internet Price Tag. Not the actual domain.",
            },
          },
        },
      ],
      // Metadata travels with every webhook event for matching + idempotency.
      metadata: {
        quote_id: args.quoteId,
        domain: args.domain,
        buyer_user_id: args.buyerUserId,
        buyer_handle: args.buyerHandle,
        amount_cents: String(args.amountCents),
      },
      payment_intent_data: { metadata: { quote_id: args.quoteId, amount_cents: String(args.amountCents) } },
      success_url: args.successUrl,
      cancel_url: args.cancelUrl,
    });
    return { checkoutUrl: session.url, providerPaymentId: session.id, mode: "charge" };
  }

  verifyWebhook(payload: string, signature: string | null): WebhookVerification {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) return { ok: false, reason: "webhook_secret_missing" };
    if (!signature) return { ok: false, reason: "missing_signature" };
    try {
      void loadStripe; // constructEvent is static; implemented via dynamic import below
    } catch {}
    return verifyStripeWebhookSync(payload, signature, secret);
  }

  async refundPayment(paymentId: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const stripe = await loadStripe();
      await stripe.refunds.create({ payment_intent: paymentId, reason: "requested_by_customer" });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}

function verifyStripeWebhookSync(payload: string, signature: string, secret: string): WebhookVerification {
  // Stripe sends "t=<unix>,v1=<hex>"; verify HMAC of "t.payload".
  const parts = Object.fromEntries(signature.split(",").map((kv) => kv.split("=") as [string, string]));
  const timestamp = parts["t"];
  const v1 = parts["v1"];
  if (!timestamp || !v1) return { ok: false, reason: "malformed_signature" };
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 60 * 10) return { ok: false, reason: "stale_timestamp" };
  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  const a = Buffer.from(v1);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "invalid_signature" };

  try {
    const body = JSON.parse(payload) as {
      id: string;
      type: string;
      data: { object: Record<string, unknown> };
    };
    const obj = body.data.object as {
      id?: string;
      object?: string;
      status?: string;
      payment_status?: string;
      payment_intent?: string;
      amount?: number;
      amount_total?: number;
      metadata?: Record<string, string>;
    };
    const type = body.type;

    // Stripe recommends listening to `checkout.session.completed` for Checkout
    // and/or `payment_intent.succeeded|payment_failed` for PaymentIntents.
    // We accept both so DEPLOY.md's webhook setup works without extra steps.
    const isCheckoutComplete =
      type === "checkout.session.completed" && (obj.status === "complete" || obj.payment_status === "paid");
    const isPiSucceeded = type === "payment_intent.succeeded";
    const isFailed = type === "payment_intent.payment_failed" || type.includes("failed");
    const isRefunded = type.includes("refunded");

    const status: ProviderEvent["status"] = isRefunded
      ? "refunded"
      : isFailed
        ? "failed"
        : isCheckoutComplete || isPiSucceeded
          ? "succeeded"
          : "other";

    // Payment identifier: prefer the PaymentIntent id; fall back to session/charge id.
    const paymentId = (obj.payment_intent as string | undefined) ?? (obj.id as string | undefined) ?? "";
    if (!paymentId) return { ok: false, reason: "missing_payment_id" };

    // Amount: metadata is authoritative for our quotes; Stripe's totals are fallback.
    const metaCents = obj.metadata?.amount_cents ? Number(obj.metadata.amount_cents) : null;
    const stripeAmount =
      typeof obj.amount_total === "number"
        ? obj.amount_total
        : typeof obj.amount === "number"
          ? obj.amount
          : null;
    const amountCents = Number.isFinite(metaCents) && (metaCents as number) > 0 ? (metaCents as number) : stripeAmount;

    return {
      ok: true,
      event: {
        id: body.id,
        type,
        paymentId,
        quoteId: obj.metadata?.quote_id ?? null,
        amountCents: amountCents ?? null,
        status,
      },
    };
  } catch {
    return { ok: false, reason: "invalid_payload" };
  }
}

// ------------------------------------------------------------------- factory
export function getPaymentProvider(): PaymentProvider {
  if (process.env.STRIPE_SECRET_KEY) return new StripeProvider();
  if (isProdDatastore) throw new ProviderNotConfiguredError("stripe");
  return new DemoProvider();
}
