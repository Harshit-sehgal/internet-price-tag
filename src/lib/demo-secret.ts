// Demo-mode webhook secret (no "server-only": the mock checkout flow is
// client-driven, but the secret itself must never reach the browser).
//
// Why: the old static fallback ("demo-webhook-secret") was predictable, so on
// a public preview deployment anyone could forge signed demo webhooks and
// drive fake takeovers. Real deployments disable the demo provider entirely
// (a configured payment provider or Supabase service key disables both the
// demo provider and the sign route) — this module hardens the remaining
// window: non-prod deployments without DEMO_WEBHOOK_SECRET set.
import { randomBytes } from "node:crypto";

const DEFAULT_PLACEHOLDER = "demo-webhook-secret";

const g = globalThis as unknown as { __iptDemoSecret?: string };

/**
 * The HMAC secret demo webhooks are signed/verified with.
 * - Explicit DEMO_WEBHOOK_SECRET when provided;
 * - otherwise a random per-process secret (never the predictable default).
 *
 * Per-process is sufficient: the signer (/api/demo/sign) and verifier
 * (/api/webhooks/payments) run in the same server process. Vercel-style
 * multi-instance deployments would need the env var — but those are exactly
 * the deployments where a real provider or Supabase disables demo mode.
 */
export function demoWebhookSecret(): string {
  const configured = process.env.DEMO_WEBHOOK_SECRET?.trim();
  if (configured && configured !== DEFAULT_PLACEHOLDER) return configured;
  if (!g.__iptDemoSecret) g.__iptDemoSecret = randomBytes(32).toString("hex");
  return g.__iptDemoSecret;
}
