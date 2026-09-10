import assert from "node:assert/strict";
import test from "node:test";
import type { Unsubscribe } from "./realtime-browser.ts";

// Supabase-branch selection test. The socket itself needs a real project
// (launch item: verify against the real project), so this file only proves:
// with Supabase env configured the module takes the SDK branch (never the
// pulse poller), and unsubscribing before the SDK loads disposes cleanly
// without creating a client or touching the network.

type Subscribe = (onChange: () => void) => Unsubscribe;

async function loadSupabaseSubscribe(): Promise<Subscribe> {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://unit-test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "unit-test-anon-key";
  const mod = await import("./realtime-browser.ts");
  return mod.subscribeToMarketChanges as Subscribe;
}

const subscribeToMarketChanges: Subscribe = await loadSupabaseSubscribe();

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) await new Promise<void>((r) => setImmediate(r));
}

test("configured env takes the Supabase branch, never the pulse poller", async () => {
  const orig = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (url: string | URL) => {
    calls.push(String(url));
    return { json: async () => ({ v: "x" }) };
  }) as typeof fetch;
  try {
    let changes = 0;
    const unsub: Unsubscribe = subscribeToMarketChanges(() => { changes += 1; });
    assert.equal(typeof unsub, "function");
    // The polling branch calls fetch synchronously inside subscribe (the
    // immediate tick); the SDK branch never does. Assert now, then dispose
    // before the background SDK import resolves so no client/socket is made.
    assert.deepEqual(calls, []);
    unsub();
    await settle();
    assert.deepEqual(calls, []);
    assert.equal(changes, 0);
  } finally {
    globalThis.fetch = orig;
  }
});

test("unsubscribe before the SDK loads disposes without network or crash", async () => {
  const orig = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (url: string | URL) => {
    calls.push(String(url));
    return { json: async () => ({ v: "x" }) };
  }) as typeof fetch;
  try {
    const unsub = subscribeToMarketChanges(() => {
      throw new Error("must not fire");
    });
    unsub(); // disposed=true before the dynamic import resolves
    await settle();
    assert.deepEqual(calls, []);
    // Second unsubscribe is a safe no-op (cleanupChannel still null).
    unsub();
    await settle();
  } finally {
    globalThis.fetch = orig;
  }
});
