import type { Metadata } from "next";
import Link from "next/link";
import { money, quoteFor } from "@/lib/game.ts";
import { getSale } from "@/lib/repo";
import { ShareButtons } from "@/components/ShareButtons";
import { LiveRefresh } from "@/components/LiveRefresh";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ saleId: string }> };

async function load(saleId: string) {
  const sale = await getSale(saleId);
  if (!sale) return null;
  const current = await getDomainState(sale.domain);
  return { sale, current };
}

async function getDomainState(domain: string) {
  const { getDomain } = await import("@/lib/repo");
  return getDomain(domain);
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { saleId } = await params;
  const data = await load(saleId);
  if (!data) return { title: "Receipt not found" };
  const { sale } = data;
  return {
    title: `@${sale.buyerHandle} took ${sale.domain} for ${money(sale.priceCents)}`,
    description: `@${sale.buyerHandle} just became the symbolic holder of ${sale.domain}'s Internet Price Tag for ${money(sale.priceCents)}. Not the actual domain.`,
    openGraph: {
      title: `@${sale.buyerHandle} took ${sale.domain} for ${money(sale.priceCents)}`,
      description: "not the actual domain lol",
    },
  };
}

export default async function SuccessPage({ params }: Params) {
  const { saleId } = await params;
  const data = await load(saleId);

  if (!data) {
    return (
      <div className="stack">
        <h1 className="display display-section">Receipt not found.</h1>
        <Link href="/" className="btn">Back to the market</Link>
      </div>
    );
  }

  const { sale, current } = data;
  const stillHolder = current?.holderUserId === sale.buyerUserId;
  const next = quoteFor({
    domain: sale.domain,
    holder: current?.holderHandle ?? null,
    priceCents: current?.priceCents ?? 0,
    version: current?.version ?? 0,
    history: [],
  });

  return (
    <div className="stack-lg" style={{ maxWidth: 720 }}>
      <LiveRefresh />
      <section className="receipt stack">
        <span className="stamp">{stillHolder ? "Tag taken" : "Receipt"}</span>
        <p className="eyebrow" style={{ margin: 0 }}>
          {sale.domain}
        </p>
        <div className="money money-hero">{money(sale.priceCents)}</div>
        <p style={{ margin: 0 }}>
          Held by <span className="mono">@{sale.buyerHandle}</span>
          {sale.previousHolderHandle ? (
            <span className="muted"> · taken from @{sale.previousHolderHandle}</span>
          ) : null}
        </p>
        <p className="small muted" style={{ margin: 0 }}>
          symbolic holder status only — not the actual domain
        </p>
        {stillHolder ? (
          <p className="small" style={{ margin: 0 }}>
            Next challenge price: <span className="money money-up">{money(next.nextPriceCents)}</span>
          </p>
        ) : (
          <p className="small field-error" style={{ margin: 0 }}>
            Someone already took this tag for {money(current?.priceCents ?? 0)}. Your receipt is
            preserved in the ledger.
          </p>
        )}
      </section>

      <ShareButtons
        domain={sale.domain}
        priceCents={sale.priceCents}
        handle={sale.buyerHandle}
        saleId={sale.id}
      />

      <section className="notice">
        <strong>What just happened?</strong> You paid for temporary symbolic holder status on this
        website&apos;s price tag for {sale.domain}. The previous holder received nothing. Anyone can
        take the tag from you by paying {money(next.nextPriceCents)}.
      </section>

      <div className="row-split">
        <Link href={`/domain/${sale.domain}`} className="btn">Defend it — view the tag</Link>
        <Link href="/" className="btn btn-primary">Back to the market</Link>
      </div>
    </div>
  );
}
