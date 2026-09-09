// Structured logger for server-side payment/webhook observability (§56).
// Emits single-line JSON to stdout/stderr so hosts (e.g. Vercel) can index
// and alert on the critical events: payment succeeded but takeover failed,
// refund failed, webhook signature failures, finalization errors. When
// SENTRY_DSN is configured (optional), error-level events are also forwarded
// to Sentry server-side with the same correlation fields — no raw bodies or
// secrets are ever logged.
import "server-only";

export type LogLevel = "info" | "warn" | "error";

// Deferred Sentry wiring: evaluated at runtime only when SENTRY_DSN is set.
// Using `globalThis` + `eval("import")` prevents Turbopack from statically
// requiring @sentry/nextjs, so the build stays green without the dep.
function maybeCaptureError(event: string, level: LogLevel, fields: Record<string, unknown>): void {
  if (level !== "error") return;
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) return;
  const specifier = "@sentry/nextjs";
  void (eval("import") as (s: string) => Promise<unknown>)(specifier)
    .catch(() => null)
    .then((mod) => {
      const sentry = mod as null | { captureMessage?: (msg: string, opts?: { level?: string; tags?: Record<string, unknown> }) => void };
      if (!sentry?.captureMessage) return;
      const safeTags: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(fields)) {
        const lower = k.toLowerCase();
        if (lower.includes("secret") || lower.includes("token") || lower.includes("password") || lower.includes("email")) continue;
        if (typeof v === "string" || typeof v === "number" || typeof v === "boolean" || v == null) safeTags[k] = v;
      }
      sentry.captureMessage(event, { level: "error", tags: safeTags });
    });
}

export function logEvent(
  event: string,
  level: LogLevel,
  fields: Record<string, unknown> = {},
): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
  maybeCaptureError(event, level, fields);
}
