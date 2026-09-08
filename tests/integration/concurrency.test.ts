// Concurrency tests (execution plan §52). These run against the in-memory
// market mirror, which implements the same locking/versioning semantics as the
// production SQL finalizer in db/schema.sql. Run against a real Postgres with
// parallel connections for the full SQL guarantee.
import assert from "node:assert/strict";
import test from "node:test";
import { finalizeTakeover, resetMemoryMarket, getDomain, seedDemoMarket } from "../../src/lib/repo.ts";

test.beforeEach(() => resetMemoryMarket());

test("scenario 1: two simultaneous first claims — exactly one holder", async () => {
  const attempts = [
    finalizeTakeover({ domain: "openai.com", buyerUserId: "u-alice", buyerHandle: "alice", expectedVersion: 0, paidCents: 500, providerPaymentId: "pi-a1" }),
    finalizeTakeover({ domain: "openai.com", buyerUserId: "u-bob", buyerHandle: "bob", expectedVersion: 0, paidCents: 500, providerPaymentId: "pi-b1" }),
  ];
  const results = await Promise.all(attempts);
  const wins = results.filter((r) => r.ok);
  assert.equal(wins.length, 1, "exactly one claim succeeds");

  const domain = await getDomain("openai.com");
  assert.equal(domain?.holderUserId, wins[0].ok ? wins[0].sale.buyerUserId : undefined);
  assert.equal(domain?.version, 1);
  assert.equal(domain?.priceCents, 500);
});

test("scenario 2: two simultaneous takeovers at $940 — exactly one succeeds", async () => {
  seedDemoMarket([{ domain: "openai.com", holderHandle: "@current", priceCents: 94000 }]);
  const current = await getDomain("openai.com");
  assert.ok(current);

  const nextPrice = 94000 + Math.max(500, Math.ceil(94000 / 100)); // 94940
  const attempts = [
    finalizeTakeover({ domain: "openai.com", buyerUserId: "u-alice", buyerHandle: "alice", expectedVersion: current.version, paidCents: nextPrice, providerPaymentId: "pi-a2" }),
    finalizeTakeover({ domain: "openai.com", buyerUserId: "u-bob", buyerHandle: "bob", expectedVersion: current.version, paidCents: nextPrice, providerPaymentId: "pi-b2" }),
  ];
  const results = await Promise.all(attempts);
  const wins = results.filter((r) => r.ok);
  assert.equal(wins.length, 1);
  assert.equal(wins[0].ok ? wins[0].sale.priceCents : -1, 94940);

  const domain = await getDomain("openai.com");
  assert.equal(domain?.version, 2);
});

test("scenario 3: stale version cannot overwrite a newer holder", async () => {
  seedDemoMarket([{ domain: "x.com", holderHandle: "@first", priceCents: 10000 }]);
  const first = await getDomain("x.com");
  assert.ok(first);

  // Alice takes at v1 → v2.
  const alice = await finalizeTakeover({ domain: "x.com", buyerUserId: "u-alice", buyerHandle: "alice", expectedVersion: 1, paidCents: 10500, providerPaymentId: "pi-a3" });
  assert.ok(alice.ok);

  // Bob's payment finalized late with a v1 quote.
  const bob = await finalizeTakeover({ domain: "x.com", buyerUserId: "u-bob", buyerHandle: "bob", expectedVersion: 1, paidCents: 10500, providerPaymentId: "pi-b3" });
  assert.deepEqual(bob, { ok: false, code: "STALE_QUOTE" });

  const domain = await getDomain("x.com");
  assert.equal(domain?.holderHandle, "alice");
  assert.equal(domain?.version, 2);
  void first;
});

test("scenario 4: duplicate webhook — one sale only", async () => {
  // Same provider payment id replayed: idempotent return, single sale.
  const a = await finalizeTakeover({ domain: "reddit.com", buyerUserId: "u-carol", buyerHandle: "carol", expectedVersion: 0, paidCents: 500, providerPaymentId: "pi-dup-1" });
  const b = await finalizeTakeover({ domain: "reddit.com", buyerUserId: "u-carol", buyerHandle: "carol", expectedVersion: 0, paidCents: 500, providerPaymentId: "pi-dup-1" });
  assert.ok(a.ok);
  assert.ok(b.ok);
  if (a.ok && b.ok) assert.equal(a.sale.id, b.sale.id, "replay returns the same sale");

  const c = await finalizeTakeover({ domain: "reddit.com", buyerUserId: "u-carol", buyerHandle: "carol", expectedVersion: 0, paidCents: 500, providerPaymentId: "pi-dup-1" });
  assert.ok(c.ok);
  if (c.ok) assert.equal(c.sale.id, a.ok ? a.sale.id : "");
});

test("scenario 5: conflicting reuse of a payment id is rejected", async () => {
  const a = await finalizeTakeover({ domain: "linear.app", buyerUserId: "u-dave", buyerHandle: "dave", expectedVersion: 0, paidCents: 500, providerPaymentId: "pi-conflict-1" });
  assert.ok(a.ok);

  const b = await finalizeTakeover({ domain: "linear.app", buyerUserId: "u-erin", buyerHandle: "erin", expectedVersion: 1, paidCents: 1000, providerPaymentId: "pi-conflict-1" });
  assert.deepEqual(b, { ok: false, code: "IDEMPOTENCY_CONFLICT" });
});

test("wrong price is rejected at finalization", async () => {
  const r = await finalizeTakeover({ domain: "vercel.com", buyerUserId: "u-frank", buyerHandle: "frank", expectedVersion: 0, paidCents: 499, providerPaymentId: "pi-wrong-1" });
  assert.deepEqual(r, { ok: false, code: "WRONG_PRICE" });
});

test("current holder cannot take over their own tag", async () => {
  seedDemoMarket([{ domain: "apple.com", holderHandle: "@solo", priceCents: 72000 }]);
  const r = await finalizeTakeover({ domain: "apple.com", buyerUserId: "demo-solo", buyerHandle: "solo", expectedVersion: 1, paidCents: 72720, providerPaymentId: "pi-self-1" });
  assert.deepEqual(r, { ok: false, code: "ALREADY_HOLDER" });
});
