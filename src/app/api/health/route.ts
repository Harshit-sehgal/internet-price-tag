export const dynamic = "force-dynamic";

// Lightweight liveness/readiness probe for Vercel/monitoring.
// Never returns secrets. Cheap: does not touch Supabase unless explicitly asked
// via ?check=db (which is opt-in so the default probe stays off the DB).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const doDbCheck = url.searchParams.get("check") === "db";

  const base: Record<string, unknown> = {
    ok: true,
    ts: new Date().toISOString(),
  };

  if (!doDbCheck) {
    return Response.json(base, { headers: { "cache-control": "no-store" } });
  }

  // Optional DB probe: verify the service role can reach Postgres.
  try {
    const { isProdDatastore } = await import("@/lib/repo");
    if (!isProdDatastore) {
      return Response.json({ ...base, datastore: "demo" }, { headers: { "cache-control": "no-store" } });
    }
    const { createClient } = await import("@supabase/supabase-js");
    const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    // Cheap: list at most 1 domain row head count.
    const { error } = await c.from("domains").select("domain", { count: "exact", head: true }).limit(1);
    if (error) throw error;
    return Response.json({ ...base, datastore: "supabase", db: "ok" }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200) },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
