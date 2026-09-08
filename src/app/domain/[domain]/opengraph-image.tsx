import { ImageResponse } from "next/og";
import { money } from "@/lib/game.ts";
import { evaluateDomain } from "@/lib/domains.ts";
import { getDomain } from "@/lib/repo";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Internet Price Tag";

export default async function OgImage({ params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  const evalResult = evaluateDomain(decodeURIComponent(domain));
  const canonical = evalResult.canonicalDomain;
  const row = canonical ? await getDomain(canonical) : null;
  const unclaimed = !row || !row.holderUserId;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#f4f1ea",
          color: "#16150f",
          padding: 64,
          fontFamily: "monospace",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 22, letterSpacing: 4, color: "#615d4e" }}>
          <span>THE INTERNET PRICE TAG</span>
          <span>SYMBOLIC — NOT THE DOMAIN</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 92, fontWeight: 700 }}>{canonical ?? "unknown"}</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 24 }}>
            <span style={{ fontSize: 120, fontWeight: 700, color: "#0a5c3d" }}>
              {unclaimed ? "$5" : money(row.priceCents)}
            </span>
            <span style={{ fontSize: 30, color: "#615d4e" }}>
              {unclaimed ? "first claim — nobody holds this yet" : `held by @${row.holderHandle}`}
            </span>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 26, borderTop: "4px solid #16150f", paddingTop: 20 }}>
          <span>TAKE IT BEFORE SOMEONE ELSE DOES</span>
          <span>internetpricetag.game</span>
        </div>
      </div>
    ),
    size,
  );
}
