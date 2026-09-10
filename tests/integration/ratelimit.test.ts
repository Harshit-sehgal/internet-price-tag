// Distributed rate limiter (user list item 4): fallback behavior + contract.
// The Upstash path is covered by interface (same fixed-window semantics);
// live Redis is verified in staging via DEPLOY.md, not in CI.
import assert from "node:assert/strict";
import test from "node:test";
import { rateLimit, resetRateLimitForTests, isSharedRateLimiter } from "../../src/lib/ratelimit.ts";

test.beforeEach(() => resetRateLimitForTests());

test("allows up to the limit, then rejects", async () => {
  assert.equal(await rateLimit("t-basic", 3, 60_000), true);
  assert.equal(await rateLimit("t-basic", 3, 60_000), true);
  assert.equal(await rateLimit("t-basic", 3, 60_000), true);
  assert.equal(await rateLimit("t-basic", 3, 60_000), false);
});

test("limits are isolated per key (account vs IP)", async () => {
  assert.equal(await rateLimit("t-user:a", 1, 60_000), true);
  assert.equal(await rateLimit("t-user:a", 1, 60_000), false);
  assert.equal(await rateLimit("t-user:b", 1, 60_000), true);
  assert.equal(await rateLimit("t-ip:1.2.3.4", 1, 60_000), true);
});

test("window expiry resets the counter", async () => {
  assert.equal(await rateLimit("t-window", 1, 20), true);
  assert.equal(await rateLimit("t-window", 1, 20), false);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(await rateLimit("t-window", 1, 20), true);
});

test("no shared limiter in CI without Redis credentials", () => {
  assert.equal(process.env.UPSTASH_REDIS_REST_URL ?? null, null);
  assert.equal(isSharedRateLimiter(), false);
});

test("Upstash REST eval sends the complete command to the root endpoint", async () => {
  const previousUrl = process.env.UPSTASH_REDIS_REST_URL;
  const previousToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const previousFetch = globalThis.fetch;
  const calls: Array<{ input: unknown; body: unknown[] }> = [];

  process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  globalThis.fetch = (async (input, init) => {
    calls.push({ input, body: JSON.parse(String(init?.body)) as unknown[] });
    return new Response(JSON.stringify({ result: 1 }), { status: 200 });
  }) as typeof globalThis.fetch;

  try {
    assert.equal(await rateLimit("t-upstash", 1, 60_000), true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.input, "https://example.upstash.io");
    assert.equal(calls[0]?.body[0], "EVAL");
    assert.match(String(calls[0]?.body[1]), /redis\.call\('INCR'/);
    assert.equal(calls[0]?.body[2], "1");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = previousUrl;
    if (previousToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = previousToken;
  }
});
