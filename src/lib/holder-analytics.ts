// Server-side holder analytics aggregation (§10).
// Reads ONLY from analytics_events — real data, no fabrication. Demo mode
// (no datastore) has no persistent events, so holders see honest empty states
// and the page says so instead of pretending.
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isProdDatastore } from "./repo.ts";

let sb: SupabaseClient | null = null;
function client(): SupabaseClient | null {
  if (!isProdDatastore) return null;
  if (sb) return sb;
  sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return sb;
}

export type HolderAnalyticsEvent = {
  event: string;
  domain: string | null;
  created_at: string;
  session_id: string | null;
};

export type DomainTraffic = {
  domain: string;
  tagViews: number;
  uniqueSessions: number;
};

export type HolderAnalytics = {
  available: boolean;
  windowDays: number;
  tagViews: number;
  tagViewSessions: number;
  profileViews: number;
  shareVisits: number;
  ctaClicks: number;
  byDomain: DomainTraffic[];
  daily: Array<{ day: string; views: number }>;
  shareVisitsByDay: Array<{ day: string; visits: number }>;
};

const WINDOW_DAYS = 30;

/**
 * Aggregate the holder-facing metrics for a handle. Every number is a real
 * COUNT from analytics_events within the window. When the datastore isn't
 * configured (demo) `available: false` and all counts are zero.
 */
export async function getHolderAnalytics(handle: string): Promise<HolderAnalytics> {
  const empty: HolderAnalytics = {
    available: false,
    windowDays: WINDOW_DAYS,
    tagViews: 0,
    tagViewSessions: 0,
    profileViews: 0,
    shareVisits: 0,
    ctaClicks: 0,
    byDomain: [],
    daily: [],
    shareVisitsByDay: [],
  };

  const c = client();
  if (!c) return empty;

  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // The handle's tag views: tag_viewed rows where props.holder = handle.
  // Supabase JSONB path filter: props->>'holder' = handle.
  const [tagViewsRes, profileViewsRes, shareVisitsRes, ctaClicksRes, tagByDomainRes, dailyRes] =
    await Promise.all([
      c.from("analytics_events")
        .select("session_id", { count: "exact", head: true })
        .eq("event", "tag_viewed")
        .eq("handle", handle)
        .gte("created_at", since),
      c.from("analytics_events")
        .select("id", { count: "exact", head: true })
        .eq("event", "profile_viewed")
        .eq("handle", handle)
        .gte("created_at", since),
      c.from("analytics_events")
        .select("id", { count: "exact", head: true })
        .eq("event", "share_visit")
        .gte("created_at", since)
        // share visits land on receipts; attribution to a holder is via the
        // sale's buyer — stored as props.buyer on share events from receipts.
        .eq("handle", handle),
      c.from("analytics_events")
        .select("id", { count: "exact", head: true })
        .eq("event", "cta_clicked")
        .eq("handle", handle)
        .gte("created_at", since),
      // Per-domain breakdown: fetch non-head rows (bounded) and aggregate here.
      c.from("analytics_events")
        .select("domain, session_id")
        .eq("event", "tag_viewed")
        .eq("handle", handle)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(2000),
      c.from("analytics_events")
        .select("created_at")
        .eq("event", "tag_viewed")
        .eq("handle", handle)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(5000),
    ]);

  if (tagViewsRes.error || profileViewsRes.error || shareVisitsRes.error || ctaClicksRes.error || tagByDomainRes.error || dailyRes.error) {
    return empty;
  }

  const tagViews = tagViewsRes.count ?? 0;
  const sessions = new Set(
    (tagByDomainRes.data ?? [])
      .map((r) => (r as { session_id: string | null }).session_id)
      .filter(Boolean) as string[],
  );

  // Group by domain.
  const byDomain = new Map<string, { views: number; sessions: Set<string> }>();
  for (const row of (tagByDomainRes.data ?? []) as Array<{ domain: string | null; session_id: string | null }>) {
    if (!row.domain) continue;
    const entry = byDomain.get(row.domain) ?? { views: 0, sessions: new Set<string>() };
    entry.views += 1;
    if (row.session_id) entry.sessions.add(row.session_id);
    byDomain.set(row.domain, entry);
  }

  // Group by day (YYYY-MM-DD, UTC).
  const daily = new Map<string, number>();
  for (const row of (dailyRes.data ?? []) as Array<{ created_at: string }>) {
    const day = row.created_at.slice(0, 10);
    daily.set(day, (daily.get(day) ?? 0) + 1);
  }

  return {
    available: true,
    windowDays: WINDOW_DAYS,
    tagViews,
    tagViewSessions: sessions.size,
    profileViews: profileViewsRes.count ?? 0,
    shareVisits: shareVisitsRes.count ?? 0,
    ctaClicks: ctaClicksRes.count ?? 0,
    byDomain: [...byDomain.entries()]
      .map(([domain, v]) => ({ domain, tagViews: v.views, uniqueSessions: v.sessions.size }))
      .sort((a, b) => b.tagViews - a.tagViews)
      .slice(0, 10),
    daily: [...daily.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, views]) => ({ day, views })),
    shareVisitsByDay: [],
  };
}
