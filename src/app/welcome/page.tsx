"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function WelcomeInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const [handle, setHandle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/handle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ handle, next }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.reason === "HANDLE_TAKEN" ? "That handle is taken." : body.error ?? "Could not save handle.");
      return;
    }
    router.push(body.next ?? next);
  }

  return (
    <div className="stack" style={{ maxWidth: 520 }}>
      <p className="eyebrow">One-time setup</p>
      <h1 className="display display-section">Pick your public handle.</h1>
      <p className="muted">
        This is the name shown on every tag you hold. It cannot be changed later, because the
        ledger is permanent.
      </p>
      <form className="field" onSubmit={submit}>
        <label htmlFor="handle">Public handle</label>
        <input
          id="handle"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder="lowercase, 3 to 20 chars, a-z 0-9 _"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
        />
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Continue"}
        </button>
        {error ? <p className="field-error">{error}</p> : null}
      </form>
    </div>
  );
}

export default function WelcomePage() {
  return (
    <Suspense fallback={null}>
      <WelcomeInner />
    </Suspense>
  );
}
