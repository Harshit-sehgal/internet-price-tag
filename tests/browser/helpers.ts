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
  if (res.ok() || res.status() === 400) return; // 400 = handle locked, already set
  throw new Error(`handle setup failed: ${res.status()}`);
}

/**
 * Unique eligible domain per call so tests never collide with demo seed data
 * or with each other, even across repeated runs against a reused server.
 */
export function uniqueDomain(): string {
  return `ipt${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}.com`;
}
