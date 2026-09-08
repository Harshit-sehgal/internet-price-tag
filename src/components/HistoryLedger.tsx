import Link from "next/link";
import { money } from "@/lib/game.ts";
import type { RepoSale } from "@/lib/repo";

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function HistoryLedger({ sales }: { sales: RepoSale[] }) {
  if (sales.length === 0) {
    return <p className="muted small">No transactions yet. This tag has never changed hands.</p>;
  }
  return (
    <div className="ledger">
      {sales.map((s) => (
        <div key={s.id} className="ledger-row">
          <Link className="who" href={`/u/${s.buyerHandle}`}>@{s.buyerHandle}</Link>
          <span className="when">{shortDate(s.createdAt)}</span>
          <span className="amount money">{money(s.priceCents)}</span>
        </div>
      ))}
    </div>
  );
}
