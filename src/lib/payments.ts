// Payment provider abstraction (execution plan §20).
// Market logic never imports a provider SDK directly.
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { isProdDatastore } from "./repo.ts";
import { demoWebhookSecret } from "./demo-secret.ts";

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

export type WebhookVerifyHeaders = {
  webhookId?: string | null;
  webhookTimestamp?: string | null;
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
  verifyWebhook(payload: string, signature: string | null, headers?: WebhookVerifyHeaders): WebhookVerification;
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
    return createHmac("sha256", demoWebhookSecret()).update(payload).digest("hex");
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
              description: "Temporary symbolic holder status on Priced. Not the actual domain.",
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

// -------------------------------------------------------------- dodo provider
/**
 * Dodo Payments — the launch provider.
 *
 * One-time dynamic pricing via a single Pay-What-You-Want product
 * (DODO_PAYMENTS_PRODUCT_ID): each quote passes its exact next price as
 * `product_cart[0].amount` in minor units, so no per-domain product is needed.
 * Webhooks follow the Standard Webhooks spec
 * (webhook-id / webhook-timestamp / webhook-signature headers, HMAC-SHA256
 * over "<id>.<timestamp>.<raw body>").
 */
export class DodoPaymentsProvider implements PaymentProvider {
  readonly name = "dodo";

  private get apiKey(): string {
    const key = process.env.DODO_PAYMENTS_API_KEY;
    if (!key) throw new ProviderNotConfiguredError("dodo");
    return key;
  }

  private get baseUrl(): string {
    const override = process.env.DODO_PAYMENTS_BASE_URL?.trim();
    if (override) return override.replace(/\/+$/, "");
    const mode = (process.env.DODO_PAYMENTS_MODE ?? "test").toLowerCase();
    return mode === "live" ? "https://live.dodopayments.com" : "https://test.dodopayments.com";
  }

  private get productId(): string {
    const id = process.env.DODO_PAYMENTS_PRODUCT_ID?.trim();
    if (!id) throw new Error("DODO_PRODUCT_NOT_CONFIGURED: create a Pay-What-You-Want one-time product and set DODO_PAYMENTS_PRODUCT_ID");
    return id;
  }

  async createCheckout(args: {
    quoteId: string;
    domain: string;
    buyerUserId: string;
    buyerHandle: string;
    amountCents: number;
    successUrl: string;
    cancelUrl: string;
  }): Promise<CheckoutResult> {
    // Dodo uses a single return_url for success/failure/cancel and appends
    // ?payment_id=&status= — the webhook (never the redirect) finalizes.
    const res = await fetch(`${this.baseUrl}/checkouts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        product_cart: [{ product_id: this.productId, quantity: 1, amount: args.amountCents }],
        // Dodo may have no region-specific methods available in a test
        // checkout. Keep card methods as the guaranteed fallback.
        allowed_payment_method_types: ["credit", "debit"],
        return_url: args.successUrl,
        cancel_url: args.cancelUrl,
        billing_currency: process.env.DODO_PAYMENTS_CURRENCY?.trim() || "USD",
        metadata: {
          quote_id: args.quoteId,
          domain: args.domain,
          buyer_user_id: args.buyerUserId,
          buyer_handle: args.buyerHandle,
          amount_cents: String(args.amountCents),
        },
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`DODO_CHECKOUT_FAILED: http ${res.status} ${detail.slice(0, 300)}`);
    }
    const session = (await res.json()) as { session_id?: string; checkout_url?: string | null };
    if (!session.session_id) throw new Error("DODO_CHECKOUT_FAILED: missing session_id");
    return { checkoutUrl: session.checkout_url ?? null, providerPaymentId: session.session_id, mode: "charge" };
  }

  verifyWebhook(payload: string, signature: string | null, headers?: WebhookVerifyHeaders): WebhookVerification {
    const secret = process.env.DODO_PAYMENTS_WEBHOOK_KEY;
    if (!secret) return { ok: false, reason: "webhook_secret_missing" };
    return verifyDodoWebhookSync(payload, signature, headers?.webhookId ?? null, headers?.webhookTimestamp ?? null, secret);
  }

  async refundPayment(paymentId: string, reason: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/refunds`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ payment_id: paymentId, reason: reason.slice(0, 500) }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        return { ok: false, error: `dodo refund http ${res.status}: ${detail.slice(0, 300)}` };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}

function dodoWebhookKeyBytes(secret: string): Buffer {
  // Dodo issues Standard-Webhooks secrets, commonly "whsec_<base64>".
  const stripped = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  try {
    const decoded = Buffer.from(stripped, "base64");
    // Only use the decoded form if it round-trips (i.e. it really was base64).
    if (decoded.length >= 16 && decoded.toString("base64").replace(/=+$/, "") === stripped.replace(/=+$/, "")) {
      return decoded;
    }
  } catch {
    // Fall through to raw bytes.
  }
  return Buffer.from(secret, "utf8");
}

function verifyDodoWebhookSync(
  payload: string,
  signature: string | null,
  webhookId: string | null,
  webhookTimestamp: string | null,
  secret: string,
): WebhookVerification {
  if (!signature) return { ok: false, reason: "missing_signature" };
  if (!webhookId) return { ok: false, reason: "missing_webhook_id" };
  if (!webhookTimestamp) return { ok: false, reason: "missing_webhook_timestamp" };
  const ts = Number(webhookTimestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: "malformed_timestamp" };
  const ageSec = Math.abs(Date.now() / 1000 - ts);
  if (ageSec > 60 * 10) return { ok: false, reason: "stale_timestamp" };

  // Standard Webhooks: one or more space/comma-separated "v1,<base64>" entries.
  const candidates = signature
    .split(/[\s,]+/)
    .map((part) => part.replace(/^v1[=:]/, "").trim())
    .filter(Boolean);
  if (candidates.length === 0) return { ok: false, reason: "malformed_signature" };
  const signedContent = `${webhookId}.${webhookTimestamp}.${payload}`;
  const expected = createHmac("sha256", dodoWebhookKeyBytes(secret)).update(signedContent, "utf8").digest("base64");
  const matched = candidates.some((candidate) => {
    const a = Buffer.from(candidate);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  });
  if (!matched) return { ok: false, reason: "invalid_signature" };

  try {
    const body = JSON.parse(payload) as {
      business_id?: string;
      id?: string;
      type?: string;
      timestamp?: string;
      data?: Record<string, unknown> & {
        payload_type?: string;
        payment_id?: unknown;
        id?: unknown;
        metadata?: unknown;
        total_amount?: unknown;
        amount?: unknown;
        tax?: unknown;
      };
    };
    const type = typeof body.type === "string" ? body.type : "";
    if (!type) return { ok: false, reason: "missing_event_type" };
    const data = body.data ?? {};

    const status: ProviderEvent["status"] =
      type === "payment.succeeded"
        ? "succeeded"
        : type === "payment.failed" || type === "payment.cancelled"
          ? "failed"
          : type.startsWith("refund.")
            ? "refunded"
            : "other";

    const paymentId =
      (typeof data.payment_id === "string" && data.payment_id) ||
      (typeof data.id === "string" && data.id) ||
      "";
    // payment.failed may arrive without a payment object in edge cases;
    // failed/other events are observability-only, so allow empty payment id.
    // Succeeded events must carry one — otherwise finalization is impossible.
    if (!paymentId && status === "succeeded") return { ok: false, reason: "missing_payment_id" };

    const meta = (data.metadata ?? {}) as Record<string, unknown>;
    const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
    const quoteId = str(meta.quote_id);
    const metaCents = Number(meta.amount_cents);
    const totalCents =
      typeof data.total_amount === "number"
        ? data.total_amount
        : typeof data.amount === "number"
          ? data.amount
          : null;
    // Dodo's total_amount includes provider-collected tax. The market price is
    // the signed product amount before tax, so validate total minus Dodo's
    // signed tax amount. Metadata remains only a fallback for event variants
    // that omit the provider amount; trusting echoed metadata first would hide
    // a wrong-amount payment.
    const taxCents = typeof data.tax === "number" && Number.isFinite(data.tax) && data.tax >= 0 ? data.tax : null;
    const amountCents =
      totalCents == null
        ? (Number.isFinite(metaCents) && metaCents > 0 ? metaCents : null)
        : taxCents == null
          ? totalCents
          : totalCents - taxCents;

    return {
      ok: true,
      event: {
        id: webhookId,
        type,
        paymentId,
        quoteId,
        amountCents,
        status,
      },
    };
  } catch {
    return { ok: false, reason: "invalid_payload" };
  }
}

// ------------------------------------------------------------------- factory
export function getPaymentProvider(): PaymentProvider {
  // Dodo is the launch default; Stripe stays as an optional adapter.
  if (process.env.DODO_PAYMENTS_API_KEY) return new DodoPaymentsProvider();
  if (process.env.STRIPE_SECRET_KEY) return new StripeProvider();
  if (isProdDatastore) throw new ProviderNotConfiguredError("dodo");
  return new DemoProvider();
}

export function getConfiguredProviderName(): "dodo" | "stripe" | "demo" {
  if (process.env.DODO_PAYMENTS_API_KEY) return "dodo";
  if (process.env.STRIPE_SECRET_KEY) return "stripe";
  return "demo";
}
