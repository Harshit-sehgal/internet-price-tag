// /api/profile route contract (§7): auth, validation codes, persistence.
import assert from "node:assert/strict";
import test from "node:test";
import { resetMemoryMarket, upsertProfile, getProfileByHandle, updateProfileExtras } from "../../src/lib/repo.ts";

test.beforeEach(() => resetMemoryMarket());

test("updateProfileExtras writes bio and CTA for the owning user only", async () => {
  await upsertProfile("user-a", "alice", null, null);
  const updated = await updateProfileExtras({
    id: "user-a",
    bio: "i price things",
    ctaLabel: "Visit my startup",
    ctaUrl: "https://example.com",
  });
  assert.ok(updated);
  assert.equal(updated?.bio, "i price things");
  assert.equal(updated?.ctaLabel, "Visit my startup");

  const reread = await getProfileByHandle("alice");
  assert.equal(reread?.ctaUrl, "https://example.com");

  // Unknown user id: no row touched.
  const missing = await updateProfileExtras({ id: "user-nope", bio: "x", ctaLabel: null, ctaUrl: null });
  assert.equal(missing, null);
  const still = await getProfileByHandle("alice");
  assert.equal(still?.bio, "i price things");
});

test("upsertProfile preserves existing extras (handle claim does not wipe CTA)", async () => {
  await upsertProfile("user-b", "bob", null, null);
  await updateProfileExtras({ id: "user-b", bio: "keep me", ctaLabel: "Follow me on X", ctaUrl: "https://x.com/bob" });
  await upsertProfile("user-b", "bob", "Bob", null);
  const reread = await getProfileByHandle("bob");
  assert.equal(reread?.bio, "keep me");
  assert.equal(reread?.ctaLabel, "Follow me on X");
});

test("clearing extras nulls them out", async () => {
  await upsertProfile("user-c", "carol", null, null);
  await updateProfileExtras({ id: "user-c", bio: "temp", ctaLabel: "temp", ctaUrl: "https://example.com" });
  await updateProfileExtras({ id: "user-c", bio: null, ctaLabel: null, ctaUrl: null });
  const reread = await getProfileByHandle("carol");
  assert.equal(reread?.bio, null);
  assert.equal(reread?.ctaLabel, null);
  assert.equal(reread?.ctaUrl, null);
});
