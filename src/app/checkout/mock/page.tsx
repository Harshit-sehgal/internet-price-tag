"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { money } from "@/lib/game.ts";

/**
 * Simulated payment page for the demo provider. It drives the exact production
 * path: a signed webhook payload is POSTed to /api/webhooks/payments, which
 * verifies the signature and finalizes the takeover atomically.
 */
function MockCheckoutInner() {
  const params = useSearchParams();
  const quoteId = params.get("quote_id") ?? "";
  const domain = params.get("domain") ?? "";
  const amountCents = Number(params.get("amount_cents") ?? 0);
  const [state, setState] = useState<"idle" | "paying" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function pay(result: "success" | "failure") {
    setState("paying");
    const eventId = `demo_evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const payload = JSON.stringify({
      id: eventId,
      type: result === "success" ? "payment_intent.succeeded" : "payment_intent.payment_failed",
      payment_intent: `demo_pi_${quoteId}`,
      metadata: {
        quote_id: quoteId,
        domain,
        amount_cents: String(amountCents),
      },
    });
    const sig = await signPayload(payload);
    const res = await fetch("/api/webhooks/payments", {
      method: "POST",
      headers: { "content-type": "application/json", "x-demo-signature": sig },
      body: payload,
    });
    const body = await res.json().catch(() => ({}));
    if (result === "failure") {
      setState("error");
      setMessage("Payment declined (simulated). No money moved.");
      return;
    }
    if (body?.result?.saleId) {
      setState("done");
      window.location.assign(`/success/${body.result.saleId}`);
      return;
    }
    setState("error");
    setMessage(
      body?.result?.reason === "stale_quote"
        ? "Someone took this tag before your payment completed. A refund was issued automatically."
        : body?.result?.reason ?? "Webhook processing failed.",
    );
  }

  async function signPayload(payload: string): Promise<string> {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode("demo-webhook-secret"),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const mac = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
    return Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  if (!quoteId) {
    return <p className="muted">Missing quote. Start again from a domain page.</p>;
  }

  return (
    <div className="stack" style={{ maxWidth: 560 }}>
      <p className="eyebrow">Demo checkout</p>
      <h1 className="display display-section">{domain}</h1>
      <div className="panel">
        <div className="panel-header">
          <span className="eyebrow">Simulated payment</span>
          <span className="small muted">no real money moves</span>
        </div>
        <div className="panel-body">
          <div className="row-split">
            <span className="muted">Amount</span>
            <span className="money money-big">{money(amountCents)}</span>
          </div>
        </div>
      </div>
      <div className="row-split" style={{ gap: "var(--space-3)" }}>
        <button className="btn btn-take" disabled={state === "paying"} onClick={() => pay("success")}>
          {state === "paying" ? "Processing…" : "Pay (succeed)"}
        </button>
        <button className="btn" disabled={state === "paying"} onClick={() => pay("failure")}>
          Simulate decline
        </button>
      </div>
      {message ? <p className="field-error small">{message}</p> : null}
    </div>
  );
}

export default function MockCheckoutPage() {
  return (
    <Suspense fallback={null}>
      <MockCheckoutInner />
    </Suspense>
  );
}
