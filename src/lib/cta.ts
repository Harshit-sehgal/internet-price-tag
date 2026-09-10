// Holder CTA validation (§7). Shared by /api/profile and UI hints.
// A CTA is a short label plus an https destination. http is rejected so a
// misconfigured http:// checkout page can never downgrade a click target.

export const CTA_LABEL_MAX = 40;
export const BIO_MAX = 280;

export type CtaValidation =
  | { ok: true; label: string; url: string }
  | { ok: false; reason: "label_required" | "label_too_long" | "url_required" | "url_invalid" | "url_too_long" | "host_reserved" };

export function validateCta(rawLabel: unknown, rawUrl: unknown): CtaValidation {
  const label = typeof rawLabel === "string" ? rawLabel.trim() : "";
  const url = typeof rawUrl === "string" ? rawUrl.trim() : "";

  if (!label && !url) return { ok: false, reason: "label_required" };
  if (!label) return { ok: false, reason: "label_required" };
  if (label.length > CTA_LABEL_MAX) return { ok: false, reason: "label_too_long" };
  if (!url) return { ok: false, reason: "url_required" };

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "url_invalid" };
  }
  if (parsed.protocol !== "https:") return { ok: false, reason: "url_invalid" };
  if (url.length > 300) return { ok: false, reason: "url_too_long" };

  // The CTA must not point back into Priced itself (self-promotion loops /
  // confusing holder-vs-site identity) and must not use a credentials-bearing
  // or non-browsable scheme (already covered by https-only).
  const selfHosts = new Set<string>();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) {
    try {
      selfHosts.add(new URL(appUrl).host.toLowerCase());
    } catch {
      /* ignore */
    }
  }
  if (selfHosts.has(parsed.host.toLowerCase())) return { ok: false, reason: "host_reserved" };

  return { ok: true, label, url: parsed.toString() };
}

export function validateBio(raw: unknown): { ok: true; bio: string | null } | { ok: false; reason: "bio_too_long" } {
  if (raw == null || raw === "") return { ok: true, bio: null };
  if (typeof raw !== "string") return { ok: false, reason: "bio_too_long" };
  const bio = raw.trim();
  if (bio.length > BIO_MAX) return { ok: false, reason: "bio_too_long" };
  return { ok: true, bio: bio || null };
}
