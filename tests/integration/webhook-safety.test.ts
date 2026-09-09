// P0 webhook/checkout safety (user list item 1).
// - Only unique-constraint errors count as duplicate webhook deliveries.
// - amount_mismatch reports the REAL refund result (no hardcoded true).
// - One quote reuses one checkout session (first-writer-wins).
// - Stale paid quotes refund deterministically and never overwrite the holder.
// - Repeated deliveries for one paymentId create exactly one sale.
import assert from "node:assert/strict";
import test from "node:test";
import {
  resetMemoryMarket,
  upsertProfile,
  createQuote,
  getQuote,
  recordPaymentEvent,
  setQuoteCheckout,
  finalizeTakeover,
  getDomain,
  listSalesForDomain,
} from "../../src/lib/repo.ts";
import { processSucceededPayment } from "../../src/lib/takeover.ts";
import { isUniqueViolation } from "../../src/lib/db-errors.ts";

test.beforeEach(() => resetMemoryMarket());

test("isUniqueViolation: only unique violations count as duplicate", () => {
  assert.equal(isUniqueViolation({ code: "23505", message: "duplicate key" }), true);
  assert.equal(
    isUniqueViolation(new Error('duplicate key value violates unique constraint "payment_events_provider_provider_event_id_key"')),
    true,
  );
  assert.equal(isUniqueViolation(new Error("connection timeout")), false);
  assert.equal(isUniqueViolation(new Error("permission denied for table payment_events")), false);
  assert.equal(isUniqueViolation({ code: "57014", message: "canceling statement due to statement timeout" }), false);
  assert.equal(isUniqueViolation(null), false);
  assert.equal(isUniqueViolation(undefined), false);
});

test("recordPaymentEvent duplicate throws a unique violation; other errors are not duplicates", async () => {
  await recordPaymentEvent({
    provider: "demo",
    providerEventId: "evt-1",
    providerPaymentId: "pi-1",
    eventType: "payment.succeeded",
    status: "received",
  });
  let dup: unknown = null;
  try {
    await recordPaymentEvent({
      provider: "demo",
      providerEventId: "evt-1",
      providerPaymentId: "pi-1",
      eventType: "payment.succeeded",
      status: "received",
    });
  } catch (e) {
    dup = e;
  }
  assert.ok(dup, "duplicate delivery must throw");
  assert.equal(isUniqueViolation(dup), true, "duplicate must classify as unique violation");
});

test("one quote reuses one checkout session (first-writer-wins)", async () => {
  await upsertProfile("u-alice", "alice", null, null);
  const quote = await createQuote("example.com", "u-alice");
  const first = await setQuoteCheckout({
    quoteId: quote.id,
    provider: "demo",
    paymentId: "pay-first",
    checkoutUrl: "/checkout/mock?q=1",
  });
  assert.equal(first.reused, false);
  assert.equal(first.paymentId, "pay-first");

  // Retry / double-click with a different session id must reuse the first.
  const second = await setQuoteCheckout({
    quoteId: quote.id,
    provider: "demo",
    paymentId: "pay-second",
    checkoutUrl: "/checkout/mock?q=2",
  });
  assert.equal(second.reused, true);
  assert.equal(second.paymentId, "pay-first");
  assert.equal(second.checkoutUrl, "/checkout/mock?q=1");

  const stored = await getQuote(quote.id);
  assert.equal(stored?.checkoutPaymentId, "pay-first");
});

test("amount mismatch never creates a sale and reports the real refund result", async () => {
  await upsertProfile("u-bob", "bob", null, null);
  const quote = await createQuote("mismatch.com", "u-bob");
  const result = await processSucceededPayment({
    provider: "demo",
    eventId: "evt-mismatch-1",
    paymentId: "pi-mismatch-1",
    quoteId: quote.id,
    paidCents: quote.nextPriceCents + 100, // wrong amount
  });
  assert.equal(result.outcome, "failed");
  assert.equal(result.reason, "amount_mismatch");
  // Demo provider refunds succeed — the flag must reflect reality, not a constant.
  assert.equal(result.refunded, true);
  const domain = await getDomain("mismatch.com");
  assert.equal(domain, null, "wrong-price payment must not materialize a domain row");
});

test("stale paid quote refunds deterministically and never overwrites the holder", async () => {
  await upsertProfile("u-carol", "carol", null, null);
  await upsertProfile("u-dave", "dave", null, null);
  const quoteCarol = await createQuote("stale.com", "u-carol");

  // Dave claims first with his own quote (same expected version 0).
  const quoteDave = await createQuote("stale.com", "u-dave");
  const daveWin = await finalizeTakeover({
    domain: "stale.com",
    buyerUserId: "u-dave",
    buyerHandle: "dave",
    expectedVersion: quoteDave.expectedVersion,
    paidCents: quoteDave.nextPriceCents,
    providerPaymentId: "pi-dave-1",
  });
  assert.ok(daveWin.ok);

  // Carol's payment arrives late with a stale version.
  const result = await processSucceededPayment({
    provider: "demo",
    eventId: "evt-stale-1",
    paymentId: "pi-carol-1",
    quoteId: quoteCarol.id,
    paidCents: quoteCarol.nextPriceCents,
  });
  assert.equal(result.outcome, "failed");
  assert.equal(result.reason, "stale_quote");
  assert.equal(result.refunded, true, "stale payment must end refunded");

  const domain = await getDomain("stale.com");
  assert.equal(domain?.holderHandle, "dave");
  const sales = await listSalesForDomain("stale.com");
  assert.equal(sales.length, 1, "stale payment must not append a second sale");
});

test("repeated deliveries for one paymentId create exactly one sale", async () => {
  await upsertProfile("u-erin", "erin", null, null);
  const quote = await createQuote("replay.com", "u-erin");
  const first = await processSucceededPayment({
    provider: "demo",
    eventId: "evt-replay-1",
    paymentId: "pi-replay-1",
    quoteId: quote.id,
    paidCents: quote.nextPriceCents,
  });
  assert.equal(first.outcome, "processed");
  assert.ok(first.saleId);

  // Same paymentId retried under a new event id → idempotent duplicate.
  const second = await processSucceededPayment({
    provider: "demo",
    eventId: "evt-replay-2",
    paymentId: "pi-replay-1",
    quoteId: quote.id,
    paidCents: quote.nextPriceCents,
  });
  assert.equal(second.outcome, "duplicate");
  assert.equal(second.saleId, first.saleId);

  const sales = await listSalesForDomain("replay.com");
  assert.equal(sales.length, 1);
});

test("unknown quote payment ends in a deterministic refunded state", async () => {
  const result = await processSucceededPayment({
    provider: "demo",
    eventId: "evt-unknown-1",
    paymentId: "pi-unknown-1",
    quoteId: "00000000-0000-4000-8000-000000000000",
    paidCents: 500,
  });
  assert.equal(result.outcome, "failed");
  assert.equal(result.reason, "unknown_quote");
  assert.equal(result.refunded, true);
});
