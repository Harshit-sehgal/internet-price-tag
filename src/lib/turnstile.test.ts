import assert from "node:assert/strict";
import test from "node:test";
import { isTurnstileEnabled, verifyTurnstile } from "./turnstile.ts";

test("passes through when Turnstile is not configured (demo/CI)", async () => {
  const previous = process.env.TURNSTILE_SECRET_KEY;
  delete process.env.TURNSTILE_SECRET_KEY;
  try {
    assert.equal(isTurnstileEnabled(), false);
    assert.deepEqual(await verifyTurnstile(undefined, null), { ok: true });
    assert.deepEqual(await verifyTurnstile("", null), { ok: true });
    assert.deepEqual(await verifyTurnstile("anything", null), { ok: true });
  } finally {
    if (previous !== undefined) process.env.TURNSTILE_SECRET_KEY = previous;
  }
});

test("fails closed on missing or malformed tokens when enabled", async () => {
  process.env.TURNSTILE_SECRET_KEY = "test-secret";
  try {
    assert.equal(isTurnstileEnabled(), true);
    assert.equal((await verifyTurnstile(undefined, null)).ok, false);
    assert.equal((await verifyTurnstile(null, null)).ok, false);
    assert.equal((await verifyTurnstile("", null)).ok, false);
    assert.equal((await verifyTurnstile(42, null)).ok, false);
    const long = "x".repeat(2049);
    assert.equal((await verifyTurnstile(long, null)).ok, false);
  } finally {
    delete process.env.TURNSTILE_SECRET_KEY;
  }
});

test("rejects invalid tokens against a stubbed siteverify endpoint", async () => {
  process.env.TURNSTILE_SECRET_KEY = "test-secret";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ success: false, "error-codes": ["invalid-input-response"] }), {
      status: 200,
    })) as typeof fetch;
  try {
    const result = await verifyTurnstile("bogus-token", "203.0.113.9");
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.reason, /invalid-input-response/);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.TURNSTILE_SECRET_KEY;
  }
});

test("accepts successful verification", async () => {
  process.env.TURNSTILE_SECRET_KEY = "test-secret";
  const originalFetch = globalThis.fetch;
  let seenBody = "";
  globalThis.fetch = (async (_url, init) => {
    seenBody = String(init?.body ?? "");
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  }) as typeof fetch;
  try {
    const result = await verifyTurnstile("good-token", "203.0.113.9");
    assert.deepEqual(result, { ok: true });
    assert.match(seenBody, /secret=test-secret/);
    assert.match(seenBody, /response=good-token/);
    assert.match(seenBody, /remoteip=203\.0\.113\.9/);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.TURNSTILE_SECRET_KEY;
  }
});
