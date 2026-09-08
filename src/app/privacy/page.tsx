export const metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <article className="stack" style={{ maxWidth: 760 }}>
      <p className="eyebrow">Legal</p>
      <h1 className="display display-section">Privacy Policy</h1>

      <h2 className="display" style={{ fontSize: 18 }}>Data we collect</h2>
      <p>
        Authentication identity (via Google or email magic link), your chosen public handle, and
        payment metadata needed to process and reconcile transactions (payment provider IDs,
        amounts, quotes). We never expose your email publicly.
      </p>

      <h2 className="display" style={{ fontSize: 18 }}>What is public</h2>
      <p>
        Your handle, the tags you hold, the full takeover ledger, and transaction amounts are
        public by design. Do not choose a handle that identifies you if you want anonymity.
      </p>

      <h2 className="display" style={{ fontSize: 18 }}>Cookies &amp; realtime</h2>
      <p>
        Supabase authentication and realtime display updates use first-party cookies and WebSocket
        connections. No third-party advertising cookies. Browser “Do Not Track” is respected by
        not loading analytics in demo mode where no analytics provider is configured.
      </p>

      <h2 className="display" style={{ fontSize: 18 }}>Payments</h2>
      <p>
        Card data never touches our servers; payments are processed by our payment provider. We
        store only provider references and amounts.
      </p>

      <h2 className="display" style={{ fontSize: 18 }}>Deletion</h2>
      <p>
        You can request account deletion. Ledger entries remain as immutable public history with
        handles retained, because the market record is the product.
      </p>
    </article>
  );
}
