// Cloudflare Turnstile bot protection (§45 "basic bot protection", §78 Safety).
// Env-optional: when TURNSTILE_SECRET_KEY is unset the check passes through, so
// demo mode, previews and CI are unaffected. Read lazily for testability.
import "server-only";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export function isTurnstileEnabled(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY);
}

export type TurnstileResult = { ok: true } | { ok: false; reason: string };

/**
 * Verify a Turnstile token issued to the browser widget. Fail-closed when the
 * feature is enabled: network errors and invalid tokens both reject.
 */
export async function verifyTurnstile(token: unknown, ip: string | null): Promise<TurnstileResult> {
  if (!isTurnstileEnabled()) return { ok: true };
  if (typeof token !== "string" || token.length === 0 || token.length > 2048) {
    return { ok: false, reason: "missing_token" };
  }
  try {
    const body = new URLSearchParams({
      secret: process.env.TURNSTILE_SECRET_KEY!,
      response: token,
    });
    if (ip) body.set("remoteip", ip);
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      body,
      // Siteverify is cheap but never worth blocking checkout on a hang.
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return { ok: false, reason: `verify_http_${res.status}` };
    const data = (await res.json()) as { success: boolean; "error-codes"?: string[] };
    if (data.success) return { ok: true };
    return { ok: false, reason: `invalid_token:${(data["error-codes"] ?? []).join(",") || "unknown"}` };
  } catch (e) {
    return { ok: false, reason: `verify_error:${e instanceof Error ? e.message : String(e)}` };
  }
}
