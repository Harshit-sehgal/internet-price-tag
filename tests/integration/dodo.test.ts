// Dodo Payments provider (user list items 2+3): Standard-Webhooks
// verification, event mapping, checkout body, refunds. Network is stubbed —
// no live Dodo calls.
import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import { DodoPaymentsProvider, getPaymentProvider } from "../../src/lib/payments.ts";

const ENV_KEYS = [
  "DODO_PAYMENTS_API_KEY",
  "DODO_PAYMENTS_MODE",
  "DODO_PAYMENTS_PRODUCT_ID",
  "DODO_PAYMENTS_WEBHOOK_KEY",
  "DODO_PAYMENTS_BASE_URL",
  "STRIPE_SECRET_KEY",
] as const;

function snapshotEnv(): Record<string, string | undefined> {
  const snap: Record<string, string | undefined> = {};
  for (const k of ENV_KEYS) snap[k] = process.env[k];
  return snap;
}

function restoreEnv(snap: Record<string, string | undefined>): void {
  for (const k of ENV_KEYS) {
    if (snap[k] === undefined) delete process.env[k];
    else process.env[k] = snap[k];
  }
}

function useDodoEnv(): void {
  delete process.env.STRIPE_SECRET_KEY;
  process.env.DODO_PAYMENTS_API_KEY = "test-key";
  process.env.DODO_PAYMENTS_MODE = "test";
  process.env.DODO_PAYMENTS_PRODUCT_ID = "pdt_test_123";
  process.env.DODO_PAYMENTS_WEBHOOK_KEY = "test-webhook-secret-0123456789";
  delete process.env.DODO_PAYMENTS_BASE_URL;
}

function signDodo(webhookId: string, timestamp: string, raw: string, secret: string): string {
  const sig = createHmac("sha256", secret).update(`${webhookId}.${timestamp}.${raw}`, "utf8").digest("base64");
  return `v1,${sig}`;
}

function succeededPayload(): { raw: string; quoteId: string } {
  const raw = JSON.stringify({
    business_id: "biz_test",
    type: "payment.succeeded",
    timestamp: new Date().toISOString(),
    data: {
      payload_type: "Payment",
      payment_id: "pay_test_001",
      total_amount: 94940,
      currency: "USD",
      metadata: { quote_id: "11111111-1111-4111-8111-111111111111", domain: "openai.com", amount_cents: "94940" },
    },
  });
  return { raw, quoteId: "11111111-1111-4111-8111-111111111111" };
}

test("dodo is the default provider when its key is set (stripe kept as fallback)", () => {
  const snap = snapshotEnv();
  try {
    useDodoEnv();
    process.env.STRIPE_SECRET_KEY = "sk_test_fallback";
    assert.equal(getPaymentProvider().name, "dodo");
    delete process.env.DODO_PAYMENTS_API_KEY;
    assert.equal(getPaymentProvider().name, "stripe");
  } finally {
    restoreEnv(snap);
  }
});

test("dodo webhook verifies and maps payment.succeeded", () => {
  const snap = snapshotEnv();
  try {
    useDodoEnv();
    const secret = process.env.DODO_PAYMENTS_WEBHOOK_KEY!;
    const provider = new DodoPaymentsProvider();
    const { raw, quoteId } = succeededPayload();
    const id = "wh_abc123";
    const ts = String(Math.floor(Date.now() / 1000));
    const res = provider.verifyWebhook(raw, signDodo(id, ts, raw, secret), { webhookId: id, webhookTimestamp: ts });
    assert.ok(res.ok, `expected ok, got ${JSON.stringify(res)}`);
    if (res.ok) {
      assert.equal(res.event.id, id);
      assert.equal(res.event.type, "payment.succeeded");
      assert.equal(res.event.paymentId, "pay_test_001");
      assert.equal(res.event.quoteId, quoteId);
      assert.equal(res.event.amountCents, 94940);
      assert.equal(res.event.status, "succeeded");
    }
  } finally {
    restoreEnv(snap);
  }
});

test("dodo webhook rejects tampered payloads, missing headers and stale timestamps", () => {
  const snap = snapshotEnv();
  try {
    useDodoEnv();
    const secret = process.env.DODO_PAYMENTS_WEBHOOK_KEY!;
    const provider = new DodoPaymentsProvider();
    const { raw } = succeededPayload();
    const id = "wh_xyz";
    const ts = String(Math.floor(Date.now() / 1000));

    const tampered = provider.verifyWebhook(`${raw} `, signDodo(id, ts, raw, secret), { webhookId: id, webhookTimestamp: ts });
    assert.deepEqual(tampered, { ok: false, reason: "invalid_signature" });

    const noId = provider.verifyWebhook(raw, signDodo(id, ts, raw, secret), { webhookId: null, webhookTimestamp: ts });
    assert.deepEqual(noId, { ok: false, reason: "missing_webhook_id" });

    const oldTs = String(Math.floor(Date.now() / 1000) - 3600);
    const stale = provider.verifyWebhook(raw, signDodo(id, oldTs, raw, secret), { webhookId: id, webhookTimestamp: oldTs });
    assert.deepEqual(stale, { ok: false, reason: "stale_timestamp" });

    const noSecret = provider.verifyWebhook(raw, signDodo(id, ts, raw, secret), { webhookId: id, webhookTimestamp: ts });
    void noSecret;
    delete process.env.DODO_PAYMENTS_WEBHOOK_KEY;
    const missing = new DodoPaymentsProvider().verifyWebhook(raw, "v1,x", { webhookId: id, webhookTimestamp: ts });
    assert.deepEqual(missing, { ok: false, reason: "webhook_secret_missing" });
  } finally {
    restoreEnv(snap);
  }
});

test("dodo webhook maps payment.failed to failed (observability-only)", () => {
  const snap = snapshotEnv();
  try {
    useDodoEnv();
    const secret = process.env.DODO_PAYMENTS_WEBHOOK_KEY!;
    const provider = new DodoPaymentsProvider();
    const raw = JSON.stringify({
      business_id: "biz_test",
      type: "payment.failed",
      timestamp: new Date().toISOString(),
      data: { payload_type: "Payment", payment_id: "pay_test_002", metadata: {} },
    });
    const id = "wh_fail1";
    const ts = String(Math.floor(Date.now() / 1000));
    const res = provider.verifyWebhook(raw, signDodo(id, ts, raw, secret), { webhookId: id, webhookTimestamp: ts });
    assert.ok(res.ok);
    if (res.ok) assert.equal(res.event.status, "failed");
  } finally {
    restoreEnv(snap);
  }
});

test("dodo checkout posts dynamic PWYW amount + quote metadata, refund posts payment_id", async () => {
  const snap = snapshotEnv();
  const realFetch = globalThis.fetch;
  try {
    useDodoEnv();
    const seen: Array<{ url: string; body: Record<string, unknown> }> = [];
    globalThis.fetch = (async (url: unknown, init?: { body?: unknown }) => {
      const u = String(url);
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      seen.push({ url: u, body });
      if (u.endsWith("/checkouts")) {
        return { ok: true, status: 200, json: async () => ({ session_id: "cks_test_1", checkout_url: "https://checkout.test/s/1" }), text: async () => "" } as unknown as Response;
      }
      return { ok: true, status: 200, json: async () => ({ refund_id: "rf_1" }), text: async () => "" } as unknown as Response;
    }) as typeof fetch;

    const provider = new DodoPaymentsProvider();
    const checkout = await provider.createCheckout({
      quoteId: "22222222-2222-4222-8222-222222222222",
      domain: "openai.com",
      buyerUserId: "u-alice",
      buyerHandle: "alice",
      amountCents: 94940,
      successUrl: "https://app.test/checkout/return?quote_id=22222222-2222-4222-8222-222222222222",
      cancelUrl: "https://app.test/domain/openai.com?checkout=cancelled",
    });
    assert.equal(checkout.checkoutUrl, "https://checkout.test/s/1");
    assert.equal(checkout.providerPaymentId, "cks_test_1");

    const cart = (seen[0].body.product_cart as Array<Record<string, unknown>>)[0];
    assert.equal(cart.product_id, "pdt_test_123");
    assert.equal(cart.amount, 94940);
    assert.deepEqual(seen[0].body.allowed_payment_method_types, ["credit", "debit"]);
    assert.equal(seen[0].body.cancel_url, "https://app.test/domain/openai.com?checkout=cancelled");
    const meta = seen[0].body.metadata as Record<string, string>;
    assert.equal(meta.quote_id, "22222222-2222-4222-8222-222222222222");
    assert.equal(meta.amount_cents, "94940");
    assert.ok(seen[0].url.startsWith("https://test.dodopayments.com/"));

    const refund = await provider.refundPayment("pay_test_001", "stale_quote");
    assert.equal(refund.ok, true);
    assert.equal(seen[1].body.payment_id, "pay_test_001");
  } finally {
    globalThis.fetch = realFetch;
    restoreEnv(snap);
  }
});

test("dodo webhook trusts the provider total over echoed quote metadata", () => {
  const snap = snapshotEnv();
  try {
    useDodoEnv();
    const secret = process.env.DODO_PAYMENTS_WEBHOOK_KEY!;
    const provider = new DodoPaymentsProvider();
    const raw = JSON.stringify({
      business_id: "biz_test",
      type: "payment.succeeded",
      timestamp: new Date().toISOString(),
      data: {
        payload_type: "Payment",
        payment_id: "pay_test_wrong_amount",
        total_amount: 500,
        metadata: { quote_id: "33333333-3333-4333-8333-333333333333", amount_cents: "94940" },
      },
    });
    const id = "wh_wrong_amount";
    const ts = String(Math.floor(Date.now() / 1000));
    const res = provider.verifyWebhook(raw, signDodo(id, ts, raw, secret), { webhookId: id, webhookTimestamp: ts });
    assert.ok(res.ok);
    if (res.ok) assert.equal(res.event.amountCents, 500);
  } finally {
    restoreEnv(snap);
  }
});

test("dodo webhook excludes provider tax from the market amount", () => {
  const snap = snapshotEnv();
  try {
    useDodoEnv();
    const secret = process.env.DODO_PAYMENTS_WEBHOOK_KEY!;
    const provider = new DodoPaymentsProvider();
    const raw = JSON.stringify({
      business_id: "biz_test",
      type: "payment.succeeded",
      timestamp: new Date().toISOString(),
      data: {
        payload_type: "Payment",
        payment_id: "pay_test_taxed",
        total_amount: 590,
        tax: 90,
        metadata: { quote_id: "44444444-4444-4444-8444-444444444444", amount_cents: "500" },
      },
    });
    const id = "wh_taxed_amount";
    const ts = String(Math.floor(Date.now() / 1000));
    const res = provider.verifyWebhook(raw, signDodo(id, ts, raw, secret), { webhookId: id, webhookTimestamp: ts });
    assert.ok(res.ok);
    if (res.ok) assert.equal(res.event.amountCents, 500);
  } finally {
    restoreEnv(snap);
  }
});
