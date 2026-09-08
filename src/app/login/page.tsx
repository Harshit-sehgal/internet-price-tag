"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { track } from "@/lib/analytics";

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [demoMode, setDemoMode] = useState(false);

  useEffect(() => {
    fetch("/api/auth/mode")
      .then((r) => r.json())
      .then((d) => setDemoMode(Boolean(d.demo)))
      .catch(() => {});
  }, []);

  async function loginWithProvider(provider: "google") {
    setBusy(true);
    track("login_started", { provider });
    const { createAuthBrowserClient } = await import("@/lib/auth-browser");
    const client = await createAuthBrowserClient();
    await client.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
  }

  async function loginWithMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setBusy(true);
    track("login_started", { provider: "magic_link" });
    const { createAuthBrowserClient } = await import("@/lib/auth-browser");
    const client = await createAuthBrowserClient();
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
  }

  const [error, setError] = useState<string | null>(null);

  if (sent) {
    return (
      <div className="stack">
        <h1 className="display display-section">Check your inbox</h1>
        <p className="muted">We sent a login link to {email}. Click it to continue your takeover.</p>
      </div>
    );
  }

  return (
    <div className="stack" style={{ maxWidth: 480 }}>
      <p className="eyebrow">Authentication</p>
      <h1 className="display display-section">Hold on — prices move fast.</h1>
      <p className="muted">
        Log in to take tags. Browsing stays free and anonymous.
      </p>

      {demoMode ? (
        <div className="notice">
          <strong>Demo mode:</strong> auth isn&apos;t configured here. You&apos;ll browse as the
          demo buyer and checkout is simulated. Configure Supabase Auth for real logins.
        </div>
      ) : null}

      <button className="btn btn-primary btn-block" disabled={busy} onClick={() => loginWithProvider("google")}>
        Continue with Google
      </button>
      <div className="row-split small muted"><span>or</span></div>
      <form className="field" onSubmit={loginWithMagicLink}>
        <label htmlFor="email">Email — magic link</label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
        <button className="btn btn-block" type="submit" disabled={busy}>
          Send login link
        </button>
      </form>
      {error ? <p className="field-error">{error}</p> : null}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
