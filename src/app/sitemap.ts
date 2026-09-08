import type { MetadataRoute } from "next";
import { listMarket } from "@/lib/repo";

export const dynamic = "force-dynamic";

/**
 * Index only meaningful market pages (§38): the homepage and claimed domains.
 * Unclaimed tags, quotes, checkouts and receipts stay out of the index.
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
      changeFrequency: "hourly" as const,
      priority: 0.8,
    })),
  ];
}
