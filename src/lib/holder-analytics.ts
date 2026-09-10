// Server-side holder analytics aggregation (§10, §18).
// All counting happens in Postgres via the holder_analytics RPC (migration
// 20260910000003): COUNT/COUNT DISTINCT and grouped aggregation never pull
// raw event rows into Node. Every number is a real count from
// analytics_events — no fabrication. Demo mode (no datastore) reports
// available: false so holders see an honest empty state instead of zeros
// pretending to be data.
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
};

const WINDOW_DAYS = 30;

/**
 * Aggregate the holder-facing metrics for a handle using SQL-side counting.
 * When the datastore isn't configured (demo) or the aggregation fails,
 * returns available: false — the UI shows honest empty states.
 */
export async function getHolderAnalytics(handle: string): Promise<HolderAnalytics> {
  const unavailable: HolderAnalytics = {
    available: false,
    windowDays: WINDOW_DAYS,
    tagViews: 0,
    tagViewSessions: 0,
    profileViews: 0,
    shareVisits: 0,
    ctaClicks: 0,
    byDomain: [],
    daily: [],
  };

  const c = client();
  if (!c) return unavailable;

  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await c.rpc("holder_analytics", {
    p_handle: handle,
    p_since: since,
  });
  if (error || !data) return unavailable;

  // PostgREST normally returns a JSON object for a scalar jsonb RPC, but
  // proxies and older client versions may wrap it in a one-row array or
  // return the JSON as text. Normalize those equivalent shapes before
  // reading the aggregate fields.
  let normalized: unknown = Array.isArray(data) ? data[0] : data;
  if (typeof normalized === "string") {
    try {
      normalized = JSON.parse(normalized) as unknown;
    } catch {
      return unavailable;
    }
  }
  if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) return unavailable;
  const raw = normalized as Record<string, unknown>;
  const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);

  const byDomain = Array.isArray(raw.by_domain)
    ? (raw.by_domain as Array<Record<string, unknown>>).map((row) => ({
        domain: String(row.domain),
        tagViews: num(row.tag_views),
        uniqueSessions: num(row.unique_sessions),
      }))
    : [];

  const daily = Array.isArray(raw.daily)
    ? (raw.daily as Array<Record<string, unknown>>).map((row) => ({
        day: String(row.day),
        views: num(row.views),
      }))
    : [];

  return {
    available: true,
    windowDays: WINDOW_DAYS,
    tagViews: num(raw.tag_views),
    tagViewSessions: num(raw.tag_view_sessions),
    profileViews: num(raw.profile_views),
    shareVisits: num(raw.share_visits),
    ctaClicks: num(raw.cta_clicks),
    byDomain: byDomain.slice(0, 10),
    daily,
  };
}
