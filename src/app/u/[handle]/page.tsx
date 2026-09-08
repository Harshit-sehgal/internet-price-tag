import type { Metadata } from "next";
import Link from "next/link";
import { money } from "@/lib/game.ts";
import { getProfileByHandle, listSalesForBuyer, listMarket } from "@/lib/repo";
import { isHandleValid } from "@/lib/domains.ts";
import { LiveRefresh } from "@/components/LiveRefresh";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ handle: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { handle } = await params;
  const h = decodeURIComponent(handle).toLowerCase().replace(/^@/, "");
  if (!isHandleValid(h)) return { title: "Unknown holder", robots: { index: false } };
  const profile = await getProfileByHandle(h);
  if (!profile) {
    return {
      title: `@${h} holds nothing yet`,
      robots: { index: false },
    };
  }
  const sales = await listSalesForBuyer(h, 1);
  const spent = sales.length > 0 ? `Latest: ${sales[0].domain} for ${money(sales[0].priceCents)}.` : "";
  return {
    title: `@${h} — holder profile`,
    description: `@${h}'s Internet Price Tag holdings and takeover history. ${spent} Not the actual domain.`,
  };
}

export default async function HolderPage({ params }: Params) {
  const { handle } = await params;
  const h = decodeURIComponent(handle).toLowerCase().replace(/^@/, "");

  if (!isHandleValid(h)) {
    return (
      <div className="stack">
        <h1 className="display display-section">That handle doesn&apos;t exist here.</h1>
        <Link href="/" className="btn">Back to the market</Link>
      </div>
    );
  }

  const profile = await getProfileByHandle(h);
  if (!profile || profile.suspendedAt) {
    return (
      <div className="stack">
        <h1 className="display display-section">@{h} holds nothing yet.</h1>
        <p className="muted">No public holder profile exists for this handle.</p>
        <Link href="/" className="btn">Back to the market</Link>
      </div>
    );
  }

  const [sales, market] = await Promise.all([
    listSalesForBuyer(h, 50),
    listMarket(500),
  ]);
  // Tags this profile currently holds (current market state, price DESC).
  const held = market.filter((row) => row.holderHandle === h);
  const spentCents = sales.reduce((acc, s) => acc + s.priceCents, 0);

  return (
    <div className="stack-lg">
      <LiveRefresh />
      <section className="stack">
        <p className="eyebrow">Holder profile</p>
        <h1 className="display display-section">@{profile.handle}</h1>
        <p className="muted" style={{ margin: 0 }}>
          {held.length > 0
            ? `Currently holds ${held.length} tag${held.length === 1 ? "" : "s"} worth ${money(held.reduce((a, t) => a + t.priceCents, 0))}.`
            : "Holds no tags right now. Someone probably took them."}
          {" "}Symbolic status only — not the actual domain.
        </p>
      </section>

      <section className="stack">
        <h2 className="display display-section">Currently held</h2>
        {held.length === 0 ? (
          <p className="muted small">No active holdings.</p>
        ) : (
          <ul className="holding-list">
            {held.map((t) => (
              <li key={t.domain} className="row-split">
                <Link href={`/domain/${t.domain}`} className="mono">{t.domain}</Link>
                <span className="money">{money(t.priceCents)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="stack">
        <h2 className="display display-section">Takeover history</h2>
        {sales.length === 0 ? (
          <p className="muted small">No takeovers yet.</p>
        ) : (
          <>
            <p className="small muted" style={{ margin: 0 }}>
              {sales.length} tag{sales.length === 1 ? "" : "s"} taken · {money(spentCents)} paid into the market
            </p>
            <ul className="holding-list">
              {sales.map((s) => (
                <li key={s.id} className="row-split">
                  <span>
                    <Link href={`/domain/${s.domain}`} className="mono">{s.domain}</Link>
                    {" "}for <span className="money">{money(s.priceCents)}</span>
                    {s.previousHolderHandle ? (
                      <span className="muted small"> · from @{s.previousHolderHandle}</span>
                    ) : (
                      <span className="muted small"> · first claim</span>
                    )}
                  </span>
                  <span className="small muted">{s.createdAt.slice(0, 10)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="notice">
        <strong>Reminder:</strong> these are symbolic price tags on a public game. Holdings do not
        include the domain, website, company, trademark, or anything the domain represents.
      </section>
    </div>
  );
}
