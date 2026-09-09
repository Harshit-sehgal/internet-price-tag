// Central domain policy module. All eligibility decisions live here — never
// scatter domain validation through frontend code (see execution plan §14).
import { normalizeDomain } from "./game.ts";

/** TLDs allowed for first paid claim at launch. */
export const ALLOWED_SUFFIXES = [
  "com",
  "org",
  "net",
  "io",
  "ai",
  "app",
  "dev",
  "co",
  "me",
  "xyz",
  "sh",
  "gg",
  "so",
  "to",
  "cc",
  "fm",
  "am",
  "tv",
  "us",
  "uk",
  "de",
  "fr",
  "in",
  "jp",
  "br",
  "ca",
  "au",
  "edu",
] as const;

/** Domains that must never be claimable (brand/impersonation and safety). */
export const DEFAULT_RESERVED_DOMAINS = [
  "google.org",
  "google.org.net",
  "apple.org",
  "apple.org.net",
  "microsoft.org",
  "microsoft.org.net",
  "amazon.org",
  "amazon.org.net",
  "whitehouse.gov",
  "cia.gov",
  "fbi.gov",
  "irs.gov",
  "nasa.org",
  "un.org",
  "who.int",
  "twitter.org",
  "x.org",
  "facebook.org",
  "instagram.org",
  "openai.org",
  "anthropic.org",
  "metamask.io",
  "ledger.com",
] as const;

export type DomainEligibility = {
  eligible: boolean;
  reason:
    | "ok"
    | "empty"
    | "too_long"
    | "malformed"
    | "unsupported_suffix"
    | "ip_address"
    | "localhost"
    | "reserved"
    | "suspended"
    | "idn_not_supported";
  canonicalDomain: string | null;
};

const HOSTNAME_RE =
  /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))*\.([a-z]{2,63})$/;

function looksLikeIp(host: string): boolean {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true; // IPv4
  if (host.includes(":")) return true; // IPv6 or host:port — port never valid here
  return false;
}

/**
 * Normalize + evaluate a user-supplied domain or URL.
 * Accepts "openai.com", "HTTPS://WWW.OpenAI.com/blog/?x=1", "openai.com." etc.
 */
export function evaluateDomain(input: string): DomainEligibility {
  const canonical = normalizeDomain(input);
  if (!canonical) return { eligible: false, reason: "empty", canonicalDomain: null };
  if (canonical.length > 253) return { eligible: false, reason: "too_long", canonicalDomain: canonical };
  // V1 explicitly does not support IDN/punycode (homograph risk + display
  // ambiguity). Reject non-ASCII inputs here so no punycode/homograph domain
  // enters the ledger. A future migration can add IDNA2008 + confusable checks.
  if (/[^\u0000-\u007F]/.test(canonical) || canonical.startsWith("xn--") || canonical.includes(".xn--")) {
    return { eligible: false, reason: "idn_not_supported", canonicalDomain: canonical };
  }

  if (looksLikeIp(canonical)) return { eligible: false, reason: "ip_address", canonicalDomain: canonical };
  if (canonical === "localhost" || canonical.endsWith(".localhost")) {
    return { eligible: false, reason: "localhost", canonicalDomain: canonical };
  }
  if (!HOSTNAME_RE.test(canonical)) return { eligible: false, reason: "malformed", canonicalDomain: canonical };

  if (DEFAULT_RESERVED_DOMAINS.includes(canonical as (typeof DEFAULT_RESERVED_DOMAINS)[number])) {
    return { eligible: false, reason: "reserved", canonicalDomain: canonical };
  }

  const parts = canonical.split(".");
  const suffix = parts[parts.length - 1];
  if (!(ALLOWED_SUFFIXES as readonly string[]).includes(suffix)) {
    return { eligible: false, reason: "unsupported_suffix", canonicalDomain: canonical };
  }

  return { eligible: true, reason: "ok", canonicalDomain: canonical };
}

/** Strict guard for paid actions: must be eligible AND canonicalized. */
export function requireEligibleDomain(input: string): string {
  const result = evaluateDomain(input);
  if (!result.eligible || !result.canonicalDomain) {
    throw new Error(`DOMAIN_INELIGIBLE: ${result.reason}`);
  }
  return result.canonicalDomain;
}

export function isHandleValid(handle: string): boolean {
  return /^[a-z0-9_]{3,20}$/.test(handle);
}

export const BANNED_HANDLES = [
  "admin",
  "administrator",
  "mod",
  "moderator",
  "staff",
  "official",
  "support",
  "help",
  "security",
  "root",
  "system",
  "owner",
  "internetpricetag",
  "price_tag",
  "pricetag",
  "ipt",
] as const;

export function isHandleAllowed(handle: string): boolean {
  const h = handle.toLowerCase();
  return isHandleValid(h) && !(BANNED_HANDLES as readonly string[]).includes(h);
}
