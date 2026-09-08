import { listMarket, listRecentSales } from "@/lib/repo";

export const dynamic = "force-dynamic";

/**
 * Cheap market-state fingerprint for the demo-mode polling fallback.
 * Realtime deployments never call this; Supabase Realtime drives updates.
 */
export async function GET() {
  try {
    const [rows, latest] = await Promise.all([listMarket(200), listRecentSales(1)]);
    const maxUpdated = rows.reduce((acc, r) => (r.updatedAt && r.updatedAt > acc ? r.updatedAt : acc), "");
    const v = `${maxUpdated}|${rows.length}|${latest[0]?.id ?? ""}|${latest[0]?.priceCents ?? ""}`;
    return Response.json({ v }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ v: "unavailable" }, { status: 500 });
  }
}
