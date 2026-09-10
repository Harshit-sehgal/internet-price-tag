// Discovery honesty (§12): Fastest Rising and Newly Claimed derive only from
// the real sales ledger, with correct ordering and no fabricated entries.
import assert from "node:assert/strict";
import test from "node:test";
import {
  resetMemoryMarket,
  seedDemoMarket,
  listFastestRising,
  listNewlyClaimed,
  finalizeTakeover,
  upsertProfile,
  getProfileById,
} from "../../src/lib/repo.ts";

test.beforeEach(() => resetMemoryMarket());

test("fastest rising ranks by absolute price increase within the window", async () => {
  seedDemoMarket([
    { domain: "big.com", holderHandle: "@biggie", priceCents: 100_000 },
    { domain: "small.com", holderHandle: "@smallie", priceCents: 1_000 },
    { domain: "flat.com", holderHandle: "@flattie", priceCents: 5_000 },
  ]);
  await upsertProfile("u-chall", "chall", null, null);
  const profile = await getProfileById("u-chall");
  assert.ok(profile);

  // Takeovers: big +1000, small +500 (min $5), flat +500.
  for (const [domain, pay] of [["big.com", 101_000], ["small.com", 1_500], ["flat.com", 5_500]] as const) {
    const d = await (await import("../../src/lib/repo.ts")).getDomain(domain);
    const out = await finalizeTakeover({
      domain, buyerUserId: "u-chall", buyerHandle: "chall",
      expectedVersion: d!.version, paidCents: pay, providerPaymentId: `pi-rising-${domain}`,
    });
    assert.ok(out.ok, `takeover failed for ${domain}`);
  }

  const rising = await listFastestRising(5);
  assert.ok(rising.length >= 3);
  // Ordered by rise DESC; flat/small tie at +500 — both below big's +1000.
  assert.equal(rising[0].domain, "big.com");
  assert.equal(rising[0].roseCents, 1000);
  const domains = rising.map((r) => r.domain);
  assert.ok(domains.includes("small.com"));
  assert.ok(domains.includes("flat.com"));
  // Each row carries live holder state (the challenger now holds them).
  assert.equal(rising[0].holderHandle, "chall");
});

test("fastest rising is empty when nothing rose", async () => {
  seedDemoMarket([{ domain: "solo.com", holderHandle: "@solo", priceCents: 500 }]);
  assert.deepEqual(await listFastestRising(5), []);
});

test("newly claimed lists only first claims, newest first", async () => {
  await upsertProfile("u-new", "newbie", null, null);
  const first = await finalizeTakeover({
    domain: "fresh-a.com", buyerUserId: "u-new", buyerHandle: "newbie",
    expectedVersion: 0, paidCents: 500, providerPaymentId: "pi-fresh-a",
  });
  assert.ok(first.ok);
  await new Promise((r) => setTimeout(r, 15)); // distinct timestamps
  const second = await finalizeTakeover({
    domain: "fresh-b.com", buyerUserId: "u-new", buyerHandle: "newbie",
    expectedVersion: 0, paidCents: 500, providerPaymentId: "pi-fresh-b",
  });
  assert.ok(second.ok);

  const fresh = await listNewlyClaimed(5);
  assert.equal(fresh.length, 2);
  assert.equal(fresh[0].domain, "fresh-b.com");
  assert.equal(fresh[1].domain, "fresh-a.com");
  assert.equal(fresh[0].holderHandle, "newbie");
});

test("newly claimed excludes takeovers of already-claimed tags", async () => {
  seedDemoMarket([{ domain: "held.com", holderHandle: "@og", priceCents: 500 }]);
  await upsertProfile("u-t2", "taker", null, null);
  const before = await listNewlyClaimed(50);
  const takeover = await finalizeTakeover({
    domain: "held.com", buyerUserId: "u-t2", buyerHandle: "taker",
    expectedVersion: 1, paidCents: 1000, providerPaymentId: "pi-held-takeover",
  });
  assert.ok(takeover.ok);
  const after = await listNewlyClaimed(50);
  // The takeover is NOT a first claim: no new entry appears for held.com.
  const beforeCount = before.filter((f) => f.domain === "held.com").length;
  const afterCount = after.filter((f) => f.domain === "held.com").length;
  assert.equal(afterCount, beforeCount, "a takeover of a held tag is not a first claim");
});
