export const metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <article className="stack" style={{ maxWidth: 760 }}>
      <p className="eyebrow">Legal</p>
      <h1 className="display display-section">Terms of Service</h1>
      <p className="small muted">Plain-language summary binding the full terms to be published before real-money launch.</p>

      <h2 className="display" style={{ fontSize: 18 }}>What this product is</h2>
      <p>
        The Internet Price Tag is a public game. A payment buys <strong>temporary symbolic holder
        status</strong> for a domain&apos;s price tag shown on this website, until another user pays
        the required next price.
      </p>

      <h2 className="display" style={{ fontSize: 18 }}>What a payment does not transfer</h2>
      <p>
        No domain registration, DNS control, website ownership, trademark, copyright, company
        ownership, equity, affiliation, endorsement, or authority to represent the real domain
        owner. Holders must not imply association with the underlying entity.
      </p>

      <h2 className="display" style={{ fontSize: 18 }}>Market rules</h2>
      <p>
        Unclaimed tags start at $5. The next price equals the current price plus the greater of $5
        or 1% of the current price, rounded up to the next cent. The challenger pays the full new
        price. There is no bidding. The current holder cannot pay to take their own tag.
      </p>

      <h2 className="display" style={{ fontSize: 18 }}>No payouts</h2>
      <p>
        When your tag is taken, the previous holder — you — receives nothing. This is not an
        investment, resale, or revenue-sharing product.
      </p>

      <h2 className="display" style={{ fontSize: 18 }}>Conduct</h2>
      <p>
        No impersonation of people or brands through handles or metadata, no unlawful or infringing
        use, no payment fraud, no automated abuse. We may suspend accounts and reserve domains, and
        will respond to takedown requests via the contact channel.
      </p>

      <p className="small muted">Contact: moderation requests via the repository issue tracker.</p>
    </article>
  );
}
