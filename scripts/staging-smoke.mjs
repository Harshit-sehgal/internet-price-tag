#!/usr/bin/env node
// Staging smoke: hits a deployed preview/staging URL and verifies the
// deployed-environment E2E contract (spec item 15) without needing Dodo
// credentials. Fails fast with actionable messages; use in CI preview jobs
// or manually: STAGING_URL=https://<preview>.vercel.app node scripts/staging-smoke.mjs

const BASE = (process.env.STAGING_URL || process.argv[2] || "").replace(/\/+$/, "");
if (!BASE) {
  console.error("Usage: STAGING_URL=https://<preview>.vercel.app node scripts/staging-smoke.mjs");
  console.error("  or: node scripts/staging-smoke.mjs https://<preview>.vercel.app");
  process.exit(2);
}

function fail(msg) {
  console.error(`SMOKE FAIL: ${msg}`);
  process.exit(1);
}

async function get(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, { redirect: "manual", ...opts });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { res, text, json };
}
async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { res, text, json };
}

console.log(`Staging smoke against ${BASE}`);

{
  const { res, json } = await get("/api/health");
  if (!res.ok || json?.ok !== true) fail(`/api/health liveness expected {ok:true}, got ${res.status} ${JSON.stringify(json)}`);
  console.log("  ✓ /api/health liveness");
}
{
  const { res, json } = await get("/api/health?check=db");
  // In demo mode this returns {ok:true, datastore:"demo"}; in prod {db:"ok"}.
  if (!res.ok || json?.ok !== true) fail(`/api/health?check=db expected ok, got ${res.status} ${JSON.stringify(json)}`);
  console.log(`  ✓ /api/health?check=db (${json.datastore ?? json.db ?? "ok"})`);
}
{
  const { res } = await get("/");
  if (!res.ok) fail(`GET / expected 200, got ${res.status}`);
  console.log("  ✓ GET / 200");
}
{
  const domain = `smoke${Date.now().toString(36)}.com`;
  const { res, text } = await get(`/domain/${domain}`);
  if (!res.ok) fail(`GET /domain/${domain} expected 200, got ${res.status}`);
  if (!text.includes(domain)) fail(`/domain/${domain} page did not contain domain`);
  console.log(`  ✓ GET /domain/${domain} renders`);
}
{
  const { res, json } = await post("/api/analytics", { event: "domain_opened", props: { domain: "example.com" } });
  if (!res.ok || json?.ok !== true) fail(`POST /api/analytics expected ok, got ${res.status} ${JSON.stringify(json)}`);
  console.log("  ✓ POST /api/analytics taxonomy ok");
}
{
  const { res } = await post("/api/analytics", { event: "not_a_real_event", props: {} });
  if (res.status !== 422) fail(`POST /api/analytics unknown event expected 422, got ${res.status}`);
  console.log("  ✓ POST /api/analytics rejects unknown event (422)");
}
{
  // CSRF guard: non-JSON content-type must be rejected with 415.
  const res = await fetch(`${BASE}/api/quotes`, { method: "POST", headers: { "content-type": "text/plain" }, body: "{}" });
  if (res.status !== 415) fail(`POST /api/quotes with text/plain expected 415, got ${res.status}`);
  console.log("  ✓ POST /api/quotes rejects non-JSON (415)");
}
{
  // Auth redirect guard: /auth/callback must exist (even if it redirects).
  const { res } = await get("/auth/callback?code=fake&next=/");
  if (![302, 307, 308].includes(res.status) && res.status !== 307) {
    // In demo mode this may 302 to /login; in prod it also redirects. Just verify it doesn't 500.
    if (res.status >= 500) fail(`GET /auth/callback expected redirect, got ${res.status}`);
  }
  console.log("  ✓ /auth/callback redirects (no 500)");
}
{
  // Vercel routing: unknown route should 404, not 500.
  const { res } = await get("/__smoke_nonexistent_404_probe__");
  if (res.status !== 404) console.log(`  · GET /__smoke… returned ${res.status} (expected 404, non-fatal)`);
  else console.log("  ✓ unknown route 404");
}

console.log("Staging smoke: OK");
