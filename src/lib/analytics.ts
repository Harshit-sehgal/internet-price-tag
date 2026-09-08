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
  | "share_visit";

const EVENTS: readonly AnalyticsEvent[] = [
  "homepage_viewed", "domain_searched", "domain_opened", "claim_clicked", "takeover_clicked",
  "login_started", "login_completed", "quote_created", "checkout_started", "checkout_blocked_bot", "payment_succeeded",
  "payment_failed", "payment_refunded", "takeover_succeeded", "share_clicked", "share_copied",
  "share_visit",
];

export function track(event: AnalyticsEvent, props: Record<string, unknown> = {}): void {
  if (!EVENTS.includes(event)) return;
  const line = JSON.stringify({ event, props, ts: new Date().toISOString() });
  if (process.env.NODE_ENV !== "production") console.info(`[analytics] ${line}`);
  // Server sink (structured logs); add a provider export here when needed.
}
