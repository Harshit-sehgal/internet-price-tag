import { APIRequestContext } from "@playwright/test";

/**
 * Demo-mode helper: the demo buyer needs a public handle before quoting.
 * In production (Supabase configured) this endpoint 401s; callers gate
 * auth-dependent tests on that themselves if ever needed.
 */
export async function handleFor(request: APIRequestContext): Promise<void> {
  const res = await request.post("/api/handle", {
    data: { handle: "smoketest" },
    headers: { "content-type": "application/json" },
  });
  // 429 is possible when checkout's IP rate-limit test ran just before;
  // the handle is still valid — the demo buyer was already registered.
  if (res.ok() || res.status() === 400 || res.status() === 429) return;
  throw new Error(`handle setup failed: ${res.status()}`);
}

/**
 * Unique eligible domain per call so tests never collide with demo seed data
 * or with each other, even across repeated runs against a reused server.
 */
export function uniqueDomain(): string {
  return `ipt${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}.com`;
}
