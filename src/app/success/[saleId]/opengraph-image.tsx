import { ImageResponse } from "next/og";
import { money } from "@/lib/game.ts";
import { getSale } from "@/lib/repo";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Takeover receipt";

export default async function SaleOgImage({ params }: { params: Promise<{ saleId: string }> }) {
  const { saleId } = await params;
  const sale = await getSale(saleId);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#16150f",
          color: "#f4f1ea",
          padding: 64,
          fontFamily: "monospace",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 22, letterSpacing: 4, color: "#cdc8ba" }}>
          <span>THE INTERNET PRICE TAG</span>
          <span>NOT THE ACTUAL DOMAIN</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 88, fontWeight: 700 }}>{sale?.domain ?? "unknown"}</div>
          <div style={{ fontSize: 132, fontWeight: 700, color: "#7ee2b1" }}>
            {sale ? money(sale.priceCents) : "—"}
          </div>
          <div style={{ fontSize: 40 }}>
            {sale ? `just taken by @${sale.buyerHandle}` : "receipt not found"}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 26, borderTop: "4px solid #f4f1ea", paddingTop: 20 }}>
          <span>THINK YOU CAN TAKE IT?</span>
          <span>internetpricetag.game</span>
        </div>
      </div>
    ),
    size,
  );
}
