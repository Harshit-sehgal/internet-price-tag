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

export function track(event: AnalyticsEvent, props: Record<string, unknown> = {}): void {
  if (!EVENTS.includes(event)) return;
  const line = JSON.stringify({ event, props, ts: new Date().toISOString() });
  if (process.env.NODE_ENV !== "production") console.info(`[analytics] ${line}`);
  // Persistent sink: POST /api/analytics (best-effort, never blocks the caller).
  // Server callers persist directly via analytics-server.ts; this shared wrapper
  // does a fire-and-forget fetch so client components can track without importing
  // server-only code. Failures are swallowed.
  try {
    const body = JSON.stringify({ event, props });
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
