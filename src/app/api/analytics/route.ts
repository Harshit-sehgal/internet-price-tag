import { NextResponse } from "next/server";
import { isAllowedAnalyticsEvent } from "@/lib/analytics";

export const dynamic = "force-dynamic";

// Accepts analytics events from both server fetch (track()) and client
// beacons (homepage_viewed, domain_searched, share_visit, etc.). Validates
// against the shared taxonomy in analytics.ts and best-effort persists to the
// analytics_events table. Never throws — callers must not fail on tracking.
export async function POST(req: Request) {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.startsWith("application/json")) {
    return NextResponse.json({ error: "unsupported_media_type" }, { status: 415 });
  }

  // 10 KiB payload limit — analytics events are small; this prevents abuse.
  const raw = await req.text().catch(() => "");
  if (raw.length === 0) return NextResponse.json({ error: "empty_body" }, { status: 400 });
  if (raw.length > 10_240) return NextResponse.json({ error: "payload_too_large" }, { status: 413 });

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const ev = (body as { event?: unknown; props?: unknown; session_id?: unknown }) ?? {};

  const event = typeof ev.event === "string" ? ev.event : "";
  if (!isAllowedAnalyticsEvent(event)) {
    return NextResponse.json({ error: "unknown_event" }, { status: 422 });
  }

  const props = ev.props && typeof ev.props === "object" && !Array.isArray(ev.props)
    ? (ev.props as Record<string, unknown>)
    : {};

  const sessionId = typeof ev.session_id === "string" ? ev.session_id.slice(0, 128) : null;
  const domain = typeof props.domain === "string" ? props.domain.slice(0, 253) : null;
  const handle = typeof props.handle === "string" ? props.handle.slice(0, 64) : null;
  // Never persist secrets/PII: drop any prop that looks like a token/secret/email
  const safeProps: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    const lower = k.toLowerCase();
    if (lower.includes("secret") || lower.includes("token") || lower.includes("password") || lower.includes("email")) {
      continue;
    }
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean" || v === null) {
      safeProps[k] = typeof v === "string" ? String(v).slice(0, 512) : v;
    }
  }

  // Best-effort persist — never fail the request on a DB error.
  try {
    const { persistAnalyticsEvent } = await import("@/lib/analytics-server");
    await persistAnalyticsEvent({
      event,
      sessionId,
      domain,
      handle,
      props: safeProps,
      userId: null, // enriched server-side when known; client calls are anonymous
    });
  } catch {
    // swallow — analytics must never break checkout or navigation
  }

  return NextResponse.json({ ok: true });
}
