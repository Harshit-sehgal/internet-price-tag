import type { MetadataRoute } from "next";

/** Keep transient/commerce routes out of search indexes (§38). */
export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/takeover/",
          "/checkout/",
          "/success/",
          "/welcome",
          "/login",
          "/auth/",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
