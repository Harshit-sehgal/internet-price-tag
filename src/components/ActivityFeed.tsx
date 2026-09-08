import Link from "next/link";
import { money } from "@/lib/game.ts";
import type { RepoSale } from "@/lib/repo.ts";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function ActivityFeed({ sales }: { sales: RepoSale[] }) {
  if (sales.length === 0) {
    return <p className="muted small">No takeovers yet. The ledger is waiting.</p>;
  }
  return (
    <div className="activity-feed">
      {sales.map((s) => (
        <div key={s.id} className="activity-item">
          <Link href={`/success/${s.id}`}>
            <span className="who mono">@{s.buyerHandle}</span> took{" "}
            <span className="mono">{s.domain}</span> for{" "}
            <span className="amt">{money(s.priceCents)}</span>
          </Link>{" "}
          <span className="muted small">{timeAgo(s.createdAt)}</span>
        </div>
      ))}
    </div>
  );
}
