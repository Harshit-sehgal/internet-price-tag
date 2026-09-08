"use client";

import { useState } from "react";
import { track } from "@/lib/analytics";

export function CheckoutButton({ quoteId }: { quoteId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function checkout() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ quoteId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `checkout failed (${res.status})`);
      track("checkout_started", { quoteId });
      if (body.checkoutUrl) {
        window.location.assign(body.checkoutUrl);
      }
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : "Checkout failed");
    }
  }

  return (
    <div className="stack" style={{ gap: "var(--space-2)" }}>
      <button className="btn btn-take btn-block" onClick={checkout} disabled={busy}>
        {busy ? "Opening checkout…" : "Continue to payment"}
      </button>
      {error ? <p className="field-error small" style={{ margin: 0 }}>{error}</p> : null}
    </div>
  );
}
