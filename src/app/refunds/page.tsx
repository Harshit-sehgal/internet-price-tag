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
        guaranteed — that is the game.
      </p>

      <h2 className="display" style={{ fontSize: 18 }}>Errors and disputes</h2>
      <p>
        Genuine billing errors (double charges, provider faults) are corrected. Contact us through
        the repository issue tracker with your payment reference.
      </p>
    </article>
  );
}
