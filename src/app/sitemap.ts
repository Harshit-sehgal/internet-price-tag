import type { MetadataRoute } from "next";
import { listMarket } from "@/lib/repo";

export const dynamic = "force-dynamic";

/**
 * Index only meaningful market pages (§38): the homepage, claimed domains, and
 * holder profiles that actually hold something. Unclaimed tags, quotes,
 * checkouts, receipts and empty holder pages stay out of the index.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const rows = await listMarket(500);
  return [
    {
      url: base,
      changeFrequency: "hourly",
      priority: 1,
    },
    ...rows.map((row) => ({
      url: `${base}/domain/${row.domain}`,
      lastModified: row.updatedAt ? new Date(row.updatedAt) : undefined,
      changeFrequency: "hourly" as const,
      priority: 0.8,
    })),
    ...Array.from(new Set(rows.map((r) => r.holderHandle).filter(Boolean) as string[])).map((handle) => ({
      url: `${base}/u/${handle}`,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })),
  ];
}
