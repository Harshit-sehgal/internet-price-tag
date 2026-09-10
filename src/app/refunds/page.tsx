export const metadata = { title: "Refund Policy" };

export default function RefundsPage() {
  return (
    <article className="stack" style={{ maxWidth: 760 }}>
      <p className="eyebrow">Legal</p>
      <h1 className="display display-section">Refund Policy</h1>

      <h2 className="display" style={{ fontSize: 18 }}>Automatic refunds</h2>
      <p>
        If your payment completes but the tag changed hands before your checkout finalized (a stale
        quote), or the amount does not match the required price, the payment is refunded
        automatically. You never pay for a takeover that did not happen.
      </p>

      <h2 className="display" style={{ fontSize: 18 }}>Completed takeovers</h2>
      <p>
        A completed takeover is generally <strong>not refundable</strong> because somebody later
        took the tag. You purchased temporary holder status, and its duration was intentionally not
        guaranteed. This does not limit any refund or consumer rights that apply by law or through
        the payment provider.
      </p>

      <h2 className="display" style={{ fontSize: 18 }}>Errors and disputes</h2>
      <p>
        Genuine billing errors such as duplicate charges or provider faults are reviewed and
        corrected where appropriate. Never post payment credentials, full provider references, or
        other private billing information in a public issue. A private billing-support channel will
        be published before real-money payments are enabled.
      </p>
    </article>
  );
}
