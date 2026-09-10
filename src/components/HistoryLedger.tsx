import Link from "next/link";
import { money } from "@/lib/game.ts";
import type { RepoSale } from "@/lib/repo";

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Provenance ledger for a tag (§8): every takeover, forever, in order.
 * Newest first in display; the list itself is chronological truth.
 */
export function HistoryLedger({ sales }: { sales: RepoSale[] }) {
  if (sales.length === 0) {
    return <p className="muted small">No transactions yet. This tag has never changed hands.</p>;
  }

  // Sales arrive newest-first; compute highest price + totals from the truth.
  const chronological = [...sales].reverse();
  const highest = sales.reduce((a, s) => Math.max(a, s.priceCents), 0);
  const total = sales.reduce((a, s) => a + s.priceCents, 0);

  return (
    <div className="stack" style={{ gap: "var(--space-3)" }}>
      <div className="row-split">
        <p className="small muted mono" style={{ margin: 0 }}>
          {sales.length} takeover{sales.length === 1 ? "" : "s"} · highest {money(highest)} · {money(total)} paid total
        </p>
      </div>
      <div className="ledger">
        {sales.map((s, i) => {
          const isLatest = i === 0;
          const delta = s.priceCents - s.previousPriceCents;
          return (
            <div key={s.id} className="ledger-row ledger-row-history">
              <span className="who">
                <Link href={`/u/${s.buyerHandle}`} className="mono">@{s.buyerHandle}</Link>
                {isLatest ? <span className="ledger-flag">current holder</span> : null}
              </span>
              <span className="from">
                {s.previousHolderHandle
                  ? <>from <Link href={`/u/${s.previousHolderHandle}`} className="mono">@{s.previousHolderHandle}</Link></>
                  : <span className="muted">first claim</span>}
              </span>
              <span className="delta money">
                +{money(delta)}
              </span>
              <span className="amount money">{money(s.priceCents)}</span>
              <span className="when">{shortDate(s.createdAt)}</span>
            </div>
          );
        })}
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        Oldest entry: {shortDate(chronological[0].createdAt)}. Sales are permanent; corrections
        require an operator intervention and never erase a record.
      </p>
    </div>
  );
}
