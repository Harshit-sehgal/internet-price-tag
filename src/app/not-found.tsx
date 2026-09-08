import Link from "next/link";

export default function NotFound() {
  return (
    <div className="stack" style={{ maxWidth: 560 }}>
      <p className="eyebrow">404 — Not found</p>
      <h1 className="display display-section">Nothing here has a price yet.</h1>
      <p className="muted">
        That page doesn&apos;t exist. The market does — try a domain or head back to the leaderboard.
      </p>
      <Link href="/" className="btn">
        Back to the market
      </Link>
    </div>
  );
}
