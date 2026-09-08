import Link from "next/link";
import { getViewer } from "@/lib/auth";

export async function SiteHeader() {
  let handle: string | null = null;
  try {
    const { user, profile } = await getViewer();
    if (user && profile) handle = profile.handle;
  } catch {
    // auth not configured (demo mode) — stay anonymous
  }

  return (
    <header className="site-header">
      <div className="shell site-header-inner">
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)", flex: 1, minWidth: 0 }}>
          <Link href="/" className="wordmark">
            The Internet <span className="tick">Price&nbsp;Tag</span>
          </Link>
        </div>
        <nav style={{ display: "flex", alignItems: "center", gap: "var(--space-4)" }}>
          {handle ? (
            <span className="mono small">@{handle}</span>
          ) : (
            <Link href="/login" className="btn btn-sm">
              Log in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
