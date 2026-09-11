// Late-payment grace window (QUOTE_LATE_PAYMENT_GRACE_MS).
//
// The 5-minute quote TTL guards against a stale PRICE, not against a slow
// payer. 3-D Secure, app-switching to a banking app, UPI/netbanking redirects
// and declined-card retries all routinely exceed five minutes. Before the
// grace window such a buyer was charged and auto-refunded despite nobody
// having outbid them.
//
// The invariant these tests pin down: the grace window may NEVER bypass a
// price or version check. A late payment is honoured only when the market has
// not moved; the moment it has, the payment must refund exactly as before.
import assert from "node:assert/strict";
import test from "node:test";
import {
  resetMemoryMarket,
  upsertProfile,
  createQuote,
  getQuote,
  finalizeTakeover,
  getDomain,
  listSalesForDomain,
} from "../../src/lib/repo.ts";
import { processSucceededPayment, latePaymentGraceMs } from "../../src/lib/takeover.ts";

const GRACE_ENV = "QUOTE_LATE_PAYMENT_GRACE_MS";

test.beforeEach(() => {
  resetMemoryMarket();
  delete process.env[GRACE_ENV];
});
test.after(() => {
  delete process.env[GRACE_ENV];
});

/** Push a quote's expiry into the past by `ms`. */
async function expireQuoteBy(quoteId: string, ms: number) {
  const q = await getQuote(quoteId);
  assert.ok(q, "quote must exist");
  q.expiresAt = new Date(Date.now() - ms).toISOString();
}

test("grace defaults to zero and is clamped", () => {
  delete process.env[GRACE_ENV];
  assert.equal(latePaymentGraceMs(), 0, "default must preserve the locked TTL behaviour");
  for (const bad of ["", "abc", "-1", "0"]) {
    process.env[GRACE_ENV] = bad;
    assert.equal(latePaymentGraceMs(), 0, bad);
  }
  process.env[GRACE_ENV] = "900000";
  assert.equal(latePaymentGraceMs(), 900_000);
  process.env[GRACE_ENV] = String(99 * 24 * 60 * 60 * 1000);
  assert.equal(latePaymentGraceMs(), 24 * 60 * 60 * 1000, "never unbounded");
});

test("grace off (default): an expired quote still refunds, exactly as before", async () => {
  await upsertProfile("u-amy", "amy", null, null);
  const quote = await createQuote("gracedefault.com", "u-amy");
  await expireQuoteBy(quote.id, 60_000);

  const result = await processSucceededPayment({
    provider: "demo",
    eventId: "evt-g0",
    paymentId: "pi-g0",
    quoteId: quote.id,
    paidCents: quote.nextPriceCents,
  });

  assert.equal(result.outcome, "failed");
  assert.equal(result.reason, "quote_expired");
  assert.equal(result.refunded, true);
  assert.equal((await getDomain("gracedefault.com"))?.holderHandle ?? null, null);
  assert.equal((await listSalesForDomain("gracedefault.com")).length, 0);
});

test("grace on, market unmoved: a slightly late payment is HONOURED, not refunded", async () => {
  process.env[GRACE_ENV] = "900000"; // 15 minutes
  await upsertProfile("u-ben", "ben", null, null);
  const quote = await createQuote("gracehonour.com", "u-ben");
  await expireQuoteBy(quote.id, 60_000); // 1 minute late, inside grace

  const result = await processSucceededPayment({
    provider: "demo",
    eventId: "evt-g1",
    paymentId: "pi-g1",
    quoteId: quote.id,
    paidCents: quote.nextPriceCents,
  });

  assert.equal(result.outcome, "processed", "unmoved market: the buyer paid the right price");
  assert.ok(result.saleId);
  assert.equal((await getDomain("gracehonour.com"))?.holderHandle, "ben");
  assert.equal((await listSalesForDomain("gracehonour.com")).length, 1);
});

test("grace on, market MOVED: a late payment still refunds as stale — grace never bypasses the version check", async () => {
  process.env[GRACE_ENV] = "900000";
  await upsertProfile("u-cara", "cara", null, null);
  await upsertProfile("u-dan", "dan", null, null);
  const caraQuote = await createQuote("gracemoved.com", "u-cara");
  await expireQuoteBy(caraQuote.id, 60_000);

  // Dan takes the tag while Cara's payment is in flight.
  const danQuote = await createQuote("gracemoved.com", "u-dan");
  const danWin = await finalizeTakeover({
    domain: "gracemoved.com",
    buyerUserId: "u-dan",
    buyerHandle: "dan",
    expectedVersion: danQuote.expectedVersion,
    paidCents: danQuote.nextPriceCents,
    providerPaymentId: "pi-dan-moved",
  });
  assert.ok(danWin.ok);

  const result = await processSucceededPayment({
    provider: "demo",
    eventId: "evt-g2",
    paymentId: "pi-g2",
    quoteId: caraQuote.id,
    paidCents: caraQuote.nextPriceCents,
  });

  assert.equal(result.outcome, "failed");
  assert.equal(result.reason, "stale_quote", "a moved market must refund even inside the grace window");
  assert.equal(result.refunded, true);
  assert.equal((await getDomain("gracemoved.com"))?.holderHandle, "dan", "the real holder must not be overwritten");
  assert.equal((await listSalesForDomain("gracemoved.com")).length, 1, "no second sale");
});

test("grace on but exceeded: the payment refunds as expired", async () => {
  process.env[GRACE_ENV] = "60000"; // 1 minute
  await upsertProfile("u-eve", "eve", null, null);
  const quote = await createQuote("gracebeyond.com", "u-eve");
  await expireQuoteBy(quote.id, 10 * 60_000); // 10 minutes late, well past grace

  const result = await processSucceededPayment({
    provider: "demo",
    eventId: "evt-g3",
    paymentId: "pi-g3",
    quoteId: quote.id,
    paidCents: quote.nextPriceCents,
  });

  assert.equal(result.outcome, "failed");
  assert.equal(result.reason, "quote_expired");
  assert.equal(result.refunded, true);
  assert.equal((await listSalesForDomain("gracebeyond.com")).length, 0);
});

test("grace on: a WRONG amount inside the grace window is still refunded", async () => {
  process.env[GRACE_ENV] = "900000";
  await upsertProfile("u-fay", "fay", null, null);
  const quote = await createQuote("gracewrongamount.com", "u-fay");
  await expireQuoteBy(quote.id, 30_000);

  const result = await processSucceededPayment({
    provider: "demo",
    eventId: "evt-g4",
    paymentId: "pi-g4",
    quoteId: quote.id,
    paidCents: quote.nextPriceCents - 100, // underpaid
  });

  assert.equal(result.outcome, "failed");
  assert.equal(result.reason, "amount_mismatch", "grace must never relax the amount check");
  assert.equal((await listSalesForDomain("gracewrongamount.com")).length, 0);
});
