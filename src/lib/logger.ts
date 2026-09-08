// Minimal structured logger for server-side payment/webhook observability (§56).
// Emits single-line JSON to stdout/stderr so hosts (e.g. Vercel) can index and
// alert on the critical events: payment succeeded but takeover failed,
// refund failed, webhook signature failures, finalization errors.
import "server-only";

export type LogLevel = "info" | "warn" | "error";

export function logEvent(
  event: string,
  level: LogLevel,
  fields: Record<string, unknown> = {},
): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
