// DB error classification for webhook retry semantics.
// Only a unique-constraint violation means "already processed, safe to ack".
// Any other DB failure (timeout, permission, connection) must surface as 500
// so the payment provider retries the webhook delivery.
import "server-only";

export function isUniqueViolation(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const err = e as {
    code?: unknown;
    message?: unknown;
    details?: unknown;
    hint?: unknown;
  };
  // PostgREST / Supabase JS surfaces Postgres codes here.
  if (err.code === "23505") return true;
  const msg = typeof err.message === "string" ? err.message : "";
  // Postgres error text + our in-memory mirror's duplicate-key message.
  if (/duplicate key value violates unique constraint/i.test(msg)) return true;
  if (/payment_events_provider_provider_event_id_key/i.test(msg)) return true;
  if (/unique.*constraint.*payment_events/i.test(msg)) return true;
  if (/already exists/i.test(msg) && /payment_events/i.test(msg)) return true;
  return false;
}
