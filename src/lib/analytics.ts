// Analytics wrapper (§42): one funnel-friendly API, provider sink behind it.
export type AnalyticsEvent =
  | "homepage_viewed"
  | "domain_searched"
  | "domain_opened"
  | "claim_clicked"
  | "takeover_clicked"
  | "login_started"
  | "login_completed"
  | "quote_created"
  | "checkout_started"
  | "checkout_blocked_bot"
  | "payment_succeeded"
  | "payment_failed"
  | "payment_refunded"
  | "takeover_succeeded"
  | "share_clicked"
  | "share_copied"
  | "share_visit"
  | "profile_viewed"
  | "profile_updated"
  | "cta_clicked"
  | "tag_viewed";

const EVENTS: readonly AnalyticsEvent[] = [
  "homepage_viewed", "domain_searched", "domain_opened", "claim_clicked", "takeover_clicked",
  "login_started", "login_completed", "quote_created", "checkout_started", "checkout_blocked_bot", "payment_succeeded",
  "payment_failed", "payment_refunded", "takeover_succeeded", "share_clicked", "share_copied",
  "share_visit", "profile_viewed", "profile_updated", "cta_clicked", "tag_viewed",
];

export function isAllowedAnalyticsEvent(event: string): event is AnalyticsEvent {
  return (EVENTS as readonly string[]).includes(event);
}

/**
 * Ephemeral per-tab visitor id for unique-session counts. sessionStorage
 * (never cookies): dies with the tab, is not durable across visits, and
 * carries no identity. If storage is unavailable, events stay anonymous
 * (session_id null) and the analytics UI still shows real view counts.
 */
function visitorSessionId(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const key = "priced.session";
    let id = sessionStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(key, id);
    }
    return id;
  } catch {
    return null;
  }
}

export function track(event: AnalyticsEvent, props: Record<string, unknown> = {}): void {
  if (!EVENTS.includes(event)) return;
  const line = JSON.stringify({ event, props, ts: new Date().toISOString() });
  if (process.env.NODE_ENV !== "production") console.info(`[analytics] ${line}`);
  // Persistent sink: POST /api/analytics (best-effort, never blocks the caller).
  // Server callers persist directly via analytics-server.ts; this shared wrapper
  // does a fire-and-forget fetch so client components can track without importing
  // server-only code. Failures are swallowed.
  try {
    const body = JSON.stringify({ event, props, session_id: visitorSessionId() });
    if (typeof fetch !== "undefined") {
      void fetch("/api/analytics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // never throw from tracking
  }
}
