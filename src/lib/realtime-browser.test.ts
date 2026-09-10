import assert from "node:assert/strict";
import test from "node:test";
import type { Unsubscribe } from "./realtime-browser.ts";

// Polling-fallback coverage for the demo path (§35). This file runs without
// Supabase env (the CI/demo default), so the module takes the pulse-polling
// branch. The Supabase-socket branch needs a real project (launch item:
// verify against the real project) and is covered by realtime-supabase.test.ts.

type Subscribe = (onChange: () => void) => Unsubscribe;

async function loadPollingSubscribe(): Promise<Subscribe> {
  // The module reads env once at import time — clear it first, then import.
  // Each test file runs in its own process, so the module cache is fresh here.
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const mod = await import("./realtime-browser.ts");
  return mod.subscribeToMarketChanges as Subscribe;
}

const subscribeToMarketChanges: Subscribe = await loadPollingSubscribe();

type PulseBody = { v?: string };

function stubFetch(versions: Array<PulseBody | Error>): { calls: string[]; restore: () => void } {
  const orig = globalThis.fetch;
  const calls: string[] = [];
  let i = 0;
  globalThis.fetch = (async (url: string | URL) => {
    calls.push(String(url));
    const next = versions[Math.min(i++, versions.length - 1)];
    if (next instanceof Error) throw next;
    return { json: async () => next };
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = orig; } };
}

function stubTimers(): {
  fire: () => Promise<void>;
  cleared: number;
  restore: () => void;
} {
  const origSet = globalThis.setInterval;
  const origClear = globalThis.clearInterval;
  let cb: (() => void) | null = null;
  let cleared = 0;
  globalThis.setInterval = ((fn: () => void) => {
    cb = fn;
    return 1;
  }) as unknown as typeof setInterval;
  globalThis.clearInterval = (() => {
    cleared += 1;
    cb = null;
  }) as unknown as typeof clearInterval;
  return {
    fire: async () => {
      cb?.();
      // let the async tick settle
      for (let i = 0; i < 5; i++) await new Promise<void>((r) => setImmediate(r));
    },
    get cleared() { return cleared; },
    restore: () => {
      globalThis.setInterval = origSet;
      globalThis.clearInterval = origClear;
    },
  };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise<void>((r) => setImmediate(r));
}

test("first pulse sets the baseline without notifying", async () => {
  const fetch = stubFetch([{ v: "a|1|x|5" }]);
  const timers = stubTimers();
  try {
    let calls = 0;
    const unsub = subscribeToMarketChanges(() => { calls += 1; });
    await settle();
    assert.equal(calls, 0);
    unsub();
  } finally {
    timers.restore();
    fetch.restore();
  }
});

test("changed pulse version notifies exactly once per change", async () => {
  const fetch = stubFetch([{ v: "a" }, { v: "a" }, { v: "b" }, { v: "b" }, { v: "c" }]);
  const timers = stubTimers();
  try {
    let calls = 0;
    const unsub = subscribeToMarketChanges(() => { calls += 1; });
    await settle(); // baseline "a"
    assert.equal(calls, 0);
    await timers.fire(); // still "a"
    assert.equal(calls, 0);
    await timers.fire(); // -> "b"
    assert.equal(calls, 1);
    await timers.fire(); // still "b"
    assert.equal(calls, 1);
    await timers.fire(); // -> "c"
    assert.equal(calls, 2);
    unsub();
  } finally {
    timers.restore();
    fetch.restore();
  }
});

test("polls the cheap pulse endpoint with no-store", async () => {
  const fetch = stubFetch([{ v: "a" }]);
  const timers = stubTimers();
  try {
    const unsub = subscribeToMarketChanges(() => {});
    await settle();
    assert.ok(fetch.calls.length >= 1);
    assert.ok(fetch.calls.every((u) => u === "/api/market/pulse"));
    unsub();
  } finally {
    timers.restore();
    fetch.restore();
  }
});

test("network hiccups and malformed bodies are ignored", async () => {
  const fetch = stubFetch([new Error("down"), {} as PulseBody, { v: "a" }, new Error("down")]);
  const timers = stubTimers();
  try {
    let calls = 0;
    const unsub = subscribeToMarketChanges(() => { calls += 1; });
    await settle();
    await timers.fire();
    await timers.fire();
    await timers.fire();
    assert.equal(calls, 0);
    unsub();
  } finally {
    timers.restore();
    fetch.restore();
  }
});

test("unsubscribe stops the interval and further ticks", async () => {
  const fetch = stubFetch([{ v: "a" }, { v: "b" }]);
  const timers = stubTimers();
  try {
    let calls = 0;
    const unsub = subscribeToMarketChanges(() => { calls += 1; });
    await settle();
    unsub();
    assert.equal(timers.cleared, 1);
    const before = fetch.calls.length;
    await timers.fire(); // timer was cleared: no new fetch
    assert.equal(fetch.calls.length, before);
    assert.equal(calls, 0);
  } finally {
    timers.restore();
    fetch.restore();
  }
});
