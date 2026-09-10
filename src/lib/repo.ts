// Server-only market repository. Two adapters behind one interface:
//  - Supabase/Postgres when env is configured (production path)
//  - deterministic in-memory store otherwise (local dev / preview)
// Quotes, takeovers and history are ALWAYS server-authoritative here.
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { quoteFor, START_PRICE_CENTS, type PriceQuote } from "./game.ts";
import { requireEligibleDomain } from "./domains.ts";

export type RepoDomain = {
  domain: string;
  holderUserId: string | null;
  holderHandle: string | null;
  priceCents: number;
  version: number;
  claimedAt: string | null;
  updatedAt: string | null;
};

export type RepoSale = {
  id: string;
  domain: string;
  buyerUserId: string;
  buyerHandle: string;
  previousHolderHandle: string | null;
  previousPriceCents: number;
  priceCents: number;
  domainVersion: number;
  providerPaymentId: string;
  createdAt: string;
};

export type RepoProfile = {
  id: string;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  suspendedAt: string | null;
};

export type RepoQuote = {
  id: string;
  domain: string;
  buyerUserId: string;
  expectedVersion: number;
  currentPriceCents: number;
  requiredIncrementCents: number;
  nextPriceCents: number;
  expiresAt: string;
  status: string;
  createdAt: string;
  // Idempotent checkout reuse: one quote maps to at most one provider session.
  // Null until the first successful POST /api/checkout for this quote.
  checkoutProvider: string | null;
  checkoutPaymentId: string | null;
  checkoutUrl: string | null;
};

export type TakeoverOutcome =
  | { ok: true; sale: RepoSale }
  | { ok: false; code: "STALE_QUOTE" | "WRONG_PRICE" | "ALREADY_HOLDER" | "IDEMPOTENCY_CONFLICT" | "FINALIZE_ERROR" };

const QUOTE_TTL_MS = 5 * 60 * 1000; // §16: ~5 minutes, configurable

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const isProdDatastore = Boolean(supabaseUrl && supabaseServiceKey);

let sb: SupabaseClient | null = null;
function client(): SupabaseClient {
  if (!sb) {
    if (!isProdDatastore) throw new Error("DATASTORE_NOT_CONFIGURED");
    sb = createClient(supabaseUrl!, supabaseServiceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return sb;
}

// ---------------------------------------------------------------- memory store
type MemState = {
  domains: Map<string, RepoDomain>;
  sales: RepoSale[];
  quotes: Map<string, RepoQuote>;
  profiles: Map<string, RepoProfile>;
  paymentEvents: Map<string, { id: string; provider: string; providerEventId: string; providerPaymentId: string; eventType: string; status: string; createdAt: string }>;
};

const g = globalThis as unknown as { __iptMem?: MemState };
function mem(): MemState {
  if (!g.__iptMem) {
    g.__iptMem = { domains: new Map(), sales: [], quotes: new Map(), profiles: new Map(), paymentEvents: new Map() };
  }
  return g.__iptMem;
}

export function resetMemoryMarket(): void {
  if (g.__iptMem) g.__iptMem = undefined as unknown as MemState;
}

function toQuote(row: Record<string, unknown>): RepoQuote {
  return {
    id: String(row.id),
    domain: String(row.domain),
    buyerUserId: String(row.buyer_user_id),
    expectedVersion: Number(row.expected_version),
    currentPriceCents: Number(row.current_price_cents),
    requiredIncrementCents: Number(row.required_increment_cents),
    nextPriceCents: Number(row.next_price_cents),
    expiresAt: String(row.expires_at),
    status: String(row.status),
    createdAt: String(row.created_at),
    checkoutProvider: row.checkout_provider == null ? null : String(row.checkout_provider),
    checkoutPaymentId: row.checkout_payment_id == null ? null : String(row.checkout_payment_id),
    checkoutUrl: row.checkout_url == null ? null : String(row.checkout_url),
  };
}

function toDomain(row: Record<string, unknown>): RepoDomain {
  return {
    domain: String(row.domain),
    holderUserId: row.holder_user_id == null ? null : String(row.holder_user_id),
    holderHandle: row.holder_handle == null ? null : String(row.holder_handle),
    priceCents: Number(row.price_cents),
    version: Number(row.version),
    claimedAt: row.claimed_at == null ? null : String(row.claimed_at),
    updatedAt: row.updated_at == null ? null : String(row.updated_at),
  };
}

function toSale(row: Record<string, unknown>): RepoSale {
  return {
    id: String(row.id),
    domain: String(row.domain),
    buyerUserId: String(row.buyer_user_id),
    buyerHandle: String(row.buyer_handle),
    previousHolderHandle: row.previous_holder_handle == null ? null : String(row.previous_holder_handle),
    previousPriceCents: Number(row.previous_price_cents),
    priceCents: Number(row.price_cents),
    domainVersion: Number(row.domain_version),
    providerPaymentId: String(row.provider_payment_id),
    createdAt: String(row.created_at),
  };
}

// ------------------------------------------------------------------- reads
export async function getDomain(domain: string): Promise<RepoDomain | null> {
  const d = requireEligibleDomain(domain);
  if (!isProdDatastore) return mem().domains.get(d) ?? null;
  const { data, error } = await client().from("domains").select("*").eq("domain", d).maybeSingle();
  if (error) throw error;
  return data ? toDomain(data) : null;
}

export async function listMarket(limit = 50): Promise<RepoDomain[]> {
  if (!isProdDatastore) {
    return [...mem().domains.values()]
      .filter((d) => d.holderUserId)
      .sort((a, b) => b.priceCents - a.priceCents || a.claimedAt!.localeCompare(b.claimedAt!))
      .slice(0, limit);
  }
  const { data, error } = await client()
    .from("domains")
    .select("*")
    .not("holder_user_id", "is", null)
    .order("price_cents", { ascending: false })
    .order("claimed_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(toDomain);
}

/** Sales where the given handle is the buyer, newest first. */
export async function listSalesForBuyer(buyerHandle: string, limit = 50): Promise<RepoSale[]> {
  const h = buyerHandle.toLowerCase().replace(/^@/, "");
  if (!isProdDatastore) {
    return mem()
      .sales.filter((s) => s.buyerHandle === h)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }
  const { data, error } = await client()
    .from("sales")
    .select("*")
    .eq("buyer_handle", h)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(toSale);
}

/**
 * Most-contested domains (§39 discovery): more than one sale, ranked by sale
 * count DESC, latest sale DESC, domain ASC — deterministic for all visitors.
 * Returns live market state so the UI can show current holder/price.
 */
export async function listMostContested(limit = 6): Promise<Array<{ domain: string; sales: number; priceCents: number; holderHandle: string }>> {
  const tally = (rows: Array<{ domain: string; createdAt: string }>) => {
    const counts = new Map<string, { count: number; latest: string }>();
    for (const r of rows) {
      const cur = counts.get(r.domain);
      if (!cur) counts.set(r.domain, { count: 1, latest: r.createdAt });
      else {
        cur.count += 1;
        if (r.createdAt > cur.latest) cur.latest = r.createdAt;
      }
    }
    return counts;
  };

  let counts: Map<string, { count: number; latest: string }>;
  if (!isProdDatastore) {
    counts = tally(mem().sales);
  } else {
    const { data, error } = await client()
      .from("sales")
      .select("domain, created_at")
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) throw error;
    counts = tally((data ?? []).map((row) => ({ domain: String(row.domain), createdAt: String(row.created_at) })));
  }

  const domains = [...counts.entries()]
    .filter(([, v]) => v.count > 1)
    .sort((a, b) => b[1].count - a[1].count || b[1].latest.localeCompare(a[1].latest) || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([domain]) => domain);
  if (domains.length === 0) return [];

  // Reserved domains must not surface in discovery (§7/§38) even if they have
  // history. Static blocklist is synchronous; the DB list is one batched read.
  const { evaluateDomain } = await import("./domains.ts");
  const dbReserved = isProdDatastore ? await listReservedInDb(domains) : new Set<string>();
  const live = domains.filter(
    (domain) => evaluateDomain(domain).reason !== "reserved" && !dbReserved.has(domain),
  );

  // Batched fetch of live market state — one query instead of one per domain.
  const rows = await listDomainsByNames(live);
  return live.flatMap((domain) => {
    const row = rows.get(domain);
    const count = counts.get(domain)?.count ?? 0;
    return row && row.holderUserId && row.holderHandle
      ? [{ domain, sales: count, priceCents: row.priceCents, holderHandle: row.holderHandle }]
      : [];
  });
}

/** Batched reserved-domain lookup (one query for a domain set). */
async function listReservedInDb(domains: string[]): Promise<Set<string>> {
  if (!isProdDatastore || domains.length === 0) return new Set();
  try {
    const { data } = await client().from("reserved_domains").select("domain").in("domain", domains);
    return new Set((data ?? []).map((row) => String(row.domain)));
  } catch {
    // If the reserved_domains table is missing, fail open but log.
    return new Set();
  }
}

/** One batched read for live domain rows (replaces per-domain getDomain N+1). */
async function listDomainsByNames(domains: string[]): Promise<Map<string, RepoDomain>> {
  if (domains.length === 0) return new Map();
  if (!isProdDatastore) {
    const m = mem();
    return new Map(domains.map((d) => [d, m.domains.get(d) ?? null]).filter(([, v]) => v !== null) as Array<[string, RepoDomain]>);
  }
  const { data, error } = await client().from("domains").select("*").in("domain", domains);
  if (error) throw error;
  const out = new Map<string, RepoDomain>();
  for (const row of data ?? []) {
    const d = toDomain(row);
    out.set(d.domain, d);
  }
  return out;
}

/**
 * Fastest Rising (§12): biggest absolute price increase from a sale within
 * the window, computed from the immutable ledger (real data only). Ranks by
 * (price - previous_price) among recent sales, then joins live market state.
 */
export async function listFastestRising(limit = 5, windowMs = 7 * 24 * 60 * 60 * 1000): Promise<Array<{ domain: string; roseCents: number; priceCents: number; holderHandle: string }>> {
  const since = new Date(Date.now() - windowMs).toISOString();
  // First claims (previous price 0) are excluded: a "rise" means a challenger
  // moved the price, not that the tag opened at $5.
  let candidates: Array<{ domain: string; roseCents: number }> = [];

  if (!isProdDatastore) {
    candidates = mem()
      .sales.filter((s) => s.createdAt >= since && s.previousPriceCents > 0)
      .map((s) => ({ domain: s.domain, roseCents: s.priceCents - s.previousPriceCents }))
      .filter((s) => s.roseCents > 0);
  } else {
    const { data, error } = await client()
      .from("sales")
      .select("domain, price_cents, previous_price_cents, created_at")
      .gte("created_at", since)
      .gt("previous_price_cents", 0)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw error;
    candidates = (data ?? [])
      .map((row) => ({
        domain: String(row.domain),
        roseCents: Number(row.price_cents) - Number(row.previous_price_cents),
      }))
      .filter((s) => s.roseCents > 0);
  }

  // Aggregate per domain (best rise in window), rank by rise DESC.
  // First claims (previous price 0) are excluded: a "rise" means a
  // challenger moved the price, not that the tag opened at $5.
  const best = new Map<string, number>();
  for (const c of candidates) {
    const cur = best.get(c.domain) ?? 0;
    if (c.roseCents > cur) best.set(c.domain, c.roseCents);
  }
  const top = [...best.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([domain]) => domain);
  if (top.length === 0) return [];

  const rows = await listDomainsByNames(top);
  return top.flatMap((domain) => {
    const row = rows.get(domain);
    const rose = best.get(domain) ?? 0;
    return row && row.holderUserId && row.holderHandle && rose > 0
      ? [{ domain, roseCents: rose, priceCents: row.priceCents, holderHandle: row.holderHandle }]
      : [];
  });
}

/**
 * Newly Claimed (§12): first claims (previous_price = 0), newest first.
 * Honest by construction: the ledger only records real first claims.
 */
export async function listNewlyClaimed(limit = 5): Promise<Array<{ domain: string; priceCents: number; holderHandle: string; createdAt: string }>> {
  let rows: Array<{ domain: string; priceCents: number; buyerHandle: string; createdAt: string }>;
  if (!isProdDatastore) {
    rows = mem()
      .sales.filter((s) => s.previousPriceCents === 0)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((s) => ({ domain: s.domain, priceCents: s.priceCents, buyerHandle: s.buyerHandle, createdAt: s.createdAt }));
    return rows.map((r) => ({ domain: r.domain, priceCents: r.priceCents, holderHandle: r.buyerHandle, createdAt: r.createdAt }));
  }
  const { data, error } = await client()
    .from("sales")
    .select("domain, price_cents, buyer_handle, created_at")
    .eq("previous_price_cents", 0)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    domain: String(row.domain),
    priceCents: Number(row.price_cents),
    holderHandle: String(row.buyer_handle),
    createdAt: String(row.created_at),
  }));
}

export async function listRecentSales(limit = 20): Promise<RepoSale[]> {
  if (!isProdDatastore) {
    return [...mem().sales].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  }
  const { data, error } = await client()
    .from("sales")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(toSale);
}

export async function listSalesForDomain(domain: string, limit = 50): Promise<RepoSale[]> {
  const d = requireEligibleDomain(domain);
  if (!isProdDatastore) {
    return mem()
      .sales.filter((s) => s.domain === d)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }
  const { data, error } = await client()
    .from("sales")
    .select("*")
    .eq("domain", d)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(toSale);
}

export async function getSale(saleId: string): Promise<RepoSale | null> {
  if (!/^[0-9a-f-]{36}$/i.test(saleId)) return null;
  if (!isProdDatastore) return mem().sales.find((s) => s.id === saleId) ?? null;
  const { data, error } = await client().from("sales").select("*").eq("id", saleId).maybeSingle();
  if (error) throw error;
  return data ? toSale(data) : null;
}

export async function getProfileByHandle(handle: string): Promise<RepoProfile | null> {
  const h = handle.toLowerCase().replace(/^@/, "");
  if (!isProdDatastore) return mem().profiles.get(h) ?? null;
  const { data, error } = await client().from("profiles").select("*").eq("handle", h).maybeSingle();
  if (error) throw error;
  return data
    ? { id: data.id, handle: data.handle, displayName: data.display_name, avatarUrl: data.avatar_url, bio: data.bio ?? null, ctaLabel: data.cta_label ?? null, ctaUrl: data.cta_url ?? null, suspendedAt: data.suspended_at }
    : null;
}

export async function getProfileById(id: string): Promise<RepoProfile | null> {
  if (!isProdDatastore) {
    for (const p of mem().profiles.values()) if (p.id === id) return p;
    return null;
  }
  const { data, error } = await client().from("profiles").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data
    ? { id: data.id, handle: data.handle, displayName: data.display_name, avatarUrl: data.avatar_url, bio: data.bio ?? null, ctaLabel: data.cta_label ?? null, ctaUrl: data.cta_url ?? null, suspendedAt: data.suspended_at }
    : null;
}

export async function marketValueCents(): Promise<number> {
  const rows = isProdDatastore
    ? await listMarket(1000)
    : [...mem().domains.values()];
  return rows.reduce((sum, d) => sum + (d.holderUserId ? d.priceCents : 0), 0);
}

// ------------------------------------------------------------------- quotes
export async function createQuote(domainInput: string, buyerUserId: string): Promise<RepoQuote> {
  const domain = requireEligibleDomain(domainInput);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + QUOTE_TTL_MS).toISOString();

  const profile = await getProfileById(buyerUserId);
  if (!profile) throw new Error("PROFILE_REQUIRED");
  if (profile.suspendedAt) throw new Error("ACCOUNT_SUSPENDED");

  if (isProdDatastore && (await isReservedInDb(domain))) throw new Error("DOMAIN_INELIGIBLE: reserved");

  if (isProdDatastore) {
    // Fresh read + holder check at quote time; version is pinned for staleness.
    const { data: row, error } = await client().from("domains").select("*").eq("domain", domain).maybeSingle();
    if (error) throw error;
    const current: RepoDomain = row
      ? toDomain(row)
      : { domain, holderUserId: null, holderHandle: null, priceCents: 0, version: 0, claimedAt: null, updatedAt: null };
    if (current.holderUserId && current.holderUserId === buyerUserId) throw new Error("ALREADY_HOLDER");
    const quote: PriceQuote = quoteFor({
      domain,
      holder: current.holderHandle,
      priceCents: current.priceCents,
      version: current.version,
      history: [],
    });
    const { data: inserted, error: insErr } = await client()
      .from("quotes")
      .insert({
        domain,
        buyer_user_id: buyerUserId,
        expected_version: current.version,
        current_price_cents: current.priceCents,
        required_increment_cents: quote.requiredIncrementCents,
        next_price_cents: quote.nextPriceCents,
        expires_at: expiresAt,
        status: "active",
      })
      .select("*")
      .single();
    if (insErr) throw insErr;
    return toQuote(inserted);
  }

  const current = mem().domains.get(domain) ?? {
    domain, holderUserId: null, holderHandle: null, priceCents: 0, version: 0, claimedAt: null, updatedAt: null,
  };
  if (current.holderUserId && current.holderUserId === buyerUserId) throw new Error("ALREADY_HOLDER");
  const q = quoteFor({ domain, holder: current.holderHandle, priceCents: current.priceCents, version: current.version, history: [] });
  const id = crypto.randomUUID();
  const quote: RepoQuote = {
    id,
    domain,
    buyerUserId,
    expectedVersion: current.version,
    currentPriceCents: current.priceCents,
    requiredIncrementCents: q.requiredIncrementCents,
    nextPriceCents: q.nextPriceCents,
    expiresAt,
    status: "active",
    createdAt: now.toISOString(),
    checkoutProvider: null,
    checkoutPaymentId: null,
    checkoutUrl: null,
  };
  mem().quotes.set(id, quote);
  return quote;
}

export async function getQuote(quoteId: string): Promise<RepoQuote | null> {
  if (!/^[0-9a-f-]{36}$/i.test(quoteId)) return null;
  if (!isProdDatastore) return mem().quotes.get(quoteId) ?? null;
  const { data, error } = await client().from("quotes").select("*").eq("id", quoteId).maybeSingle();
  if (error) throw error;
  return data ? toQuote(data) : null;
}

export async function markQuoteStatus(quoteId: string, status: RepoQuote["status"]): Promise<void> {
  if (!isProdDatastore) {
    const q = mem().quotes.get(quoteId);
    if (q) q.status = status;
    return;
  }
  const { error } = await client().from("quotes").update({ status }).eq("id", quoteId);
  if (error) throw error;
}

/**
 * Persist the provider session for a quote so retries reuse one checkout.
 * First writer wins: a concurrent second checkout for the same quote reuses
 * the stored session instead of creating a second payment session.
 * Returns the authoritative (existing-or-newly-stored) checkout triple.
 */
export async function setQuoteCheckout(args: {
  quoteId: string;
  provider: string;
  paymentId: string;
  checkoutUrl: string | null;
}): Promise<{ paymentId: string; checkoutUrl: string | null; reused: boolean }> {
  if (!isProdDatastore) {
    const q = mem().quotes.get(args.quoteId);
    if (!q) throw new Error("UNKNOWN_QUOTE");
    if (q.checkoutPaymentId) {
      return { paymentId: q.checkoutPaymentId, checkoutUrl: q.checkoutUrl, reused: true };
    }
    q.checkoutProvider = args.provider;
    q.checkoutPaymentId = args.paymentId;
    q.checkoutUrl = args.checkoutUrl;
    if (q.status === "active") q.status = "checkout_created";
    return { paymentId: args.paymentId, checkoutUrl: args.checkoutUrl, reused: false };
  }
  // Claim the row only if no checkout was stored yet (atomic first-writer-wins).
  const { data: claimed, error: claimErr } = await client()
    .from("quotes")
    .update({
      checkout_provider: args.provider,
      checkout_payment_id: args.paymentId,
      checkout_url: args.checkoutUrl,
      status: "checkout_created",
    })
    .is("checkout_payment_id", null)
    .eq("id", args.quoteId)
    .select("checkout_payment_id, checkout_url");
  if (claimErr) throw claimErr;
  const row = (claimed ?? [])[0] as { checkout_payment_id: string; checkout_url: string | null } | undefined;
  if (row?.checkout_payment_id) {
    const reused = row.checkout_payment_id !== args.paymentId;
    return { paymentId: row.checkout_payment_id, checkoutUrl: row.checkout_url, reused };
  }
  // Lost the race (or the column is missing on an old DB): read the winner.
  const current = await getQuote(args.quoteId);
  if (current?.checkoutPaymentId) {
    return { paymentId: current.checkoutPaymentId, checkoutUrl: current.checkoutUrl, reused: true };
  }
  // Column missing (migration not applied): fall back to the just-created
  // session rather than failing checkout. The quote status was still advanced
  // by the update above if the column exists; ensure it here for old schemas.
  try {
    await markQuoteStatus(args.quoteId, "checkout_created");
  } catch {
    // Status write failing must not fail a valid checkout creation.
  }
  return { paymentId: args.paymentId, checkoutUrl: args.checkoutUrl, reused: false };
}

// --------------------------------------------------------------- finalization
export type FinalizeInput = {
  domain: string;
  buyerUserId: string;
  buyerHandle: string;
  expectedVersion: number;
  paidCents: number;
  providerPaymentId: string;
};

export async function finalizeTakeover(input: FinalizeInput): Promise<TakeoverOutcome> {
  if (isProdDatastore) {
    const { data, error } = await client().rpc("finalize_takeover", {
      p_domain: input.domain,
      p_buyer_user_id: input.buyerUserId,
      p_buyer_handle: input.buyerHandle,
      p_expected_version: input.expectedVersion,
      p_paid_cents: input.paidCents,
      p_provider_payment_id: input.providerPaymentId,
    });
    if (error) {
      const code = error.message.split(" ")[0]?.replace(/["']/g, "");
      if (code === "STALE_QUOTE") return { ok: false, code: "STALE_QUOTE" };
      if (code === "ALREADY_HOLDER") return { ok: false, code: "ALREADY_HOLDER" };
      if (code === "WRONG_PRICE") return { ok: false, code: "WRONG_PRICE" };
      if (code === "IDEMPOTENCY_CONFLICT") return { ok: false, code: "IDEMPOTENCY_CONFLICT" };
      if (code === "RESERVED_DOMAIN") return { ok: false, code: "FINALIZE_ERROR" };
      return { ok: false, code: "FINALIZE_ERROR" };
    }
    return { ok: true, sale: toSale(data) };
  }

  // In-memory mirror of db/schema.sql finalize_takeover, with the same codes.
  const m = mem();
  const existing = m.sales.find((s) => s.providerPaymentId === input.providerPaymentId);
  if (existing) {
    if (existing.domain !== input.domain || existing.buyerUserId !== input.buyerUserId || existing.priceCents !== input.paidCents) {
      return { ok: false, code: "IDEMPOTENCY_CONFLICT" };
    }
    return { ok: true, sale: existing };
  }

  let d = m.domains.get(input.domain);
  if (!d) {
    d = { domain: input.domain, holderUserId: null, holderHandle: null, priceCents: 0, version: 0, claimedAt: null, updatedAt: null };
    m.domains.set(input.domain, d);
  }

  if (d.version !== input.expectedVersion) return { ok: false, code: "STALE_QUOTE" };
  if (d.holderUserId && d.holderUserId === input.buyerUserId) return { ok: false, code: "ALREADY_HOLDER" };

  const required = d.holderUserId == null || d.priceCents === 0
    ? START_PRICE_CENTS
    : d.priceCents + Math.max(500, Math.ceil(d.priceCents / 100));
  if (input.paidCents !== required) return { ok: false, code: "WRONG_PRICE" };

  const sale: RepoSale = {
    id: crypto.randomUUID(),
    domain: d.domain,
    buyerUserId: input.buyerUserId,
    buyerHandle: input.buyerHandle,
    previousHolderHandle: d.holderHandle,
    previousPriceCents: d.priceCents,
    priceCents: input.paidCents,
    domainVersion: d.version + 1,
    providerPaymentId: input.providerPaymentId,
    createdAt: new Date().toISOString(),
  };
  m.domains.set(input.domain, {
    ...d,
    holderUserId: input.buyerUserId,
    holderHandle: input.buyerHandle,
    priceCents: input.paidCents,
    version: d.version + 1,
    claimedAt: d.claimedAt ?? sale.createdAt,
    updatedAt: sale.createdAt,
  });
  m.sales.push(sale);
  return { ok: true, sale };
}

// ------------------------------------------------------------------ profiles
export async function upsertProfile(id: string, handle: string, displayName: string | null, avatarUrl: string | null): Promise<RepoProfile> {
  const h = handle.toLowerCase();
  if (!isProdDatastore) {
    const existing = mem().profiles.get(h);
    const profile: RepoProfile = {
      id, handle: h, displayName, avatarUrl,
      bio: existing?.bio ?? null,
      ctaLabel: existing?.ctaLabel ?? null,
      ctaUrl: existing?.ctaUrl ?? null,
      suspendedAt: null,
    };
    mem().profiles.set(h, profile);
    return profile;
  }
  const { data, error } = await client()
    .from("profiles")
    .upsert({ id, handle: h, display_name: displayName, avatar_url: avatarUrl }, { onConflict: "id" })
    .select("*")
    .single();
  if (error) throw error;
  return { id: data.id, handle: data.handle, displayName: data.display_name, avatarUrl: data.avatar_url, bio: data.bio ?? null, ctaLabel: data.cta_label ?? null, ctaUrl: data.cta_url ?? null, suspendedAt: data.suspended_at };
}

/**
 * Holder-authored profile extras (bio + CTA). Validated upstream in
 * /api/profile; this layer only persists. Handle is immutable and is NOT
 * writable here.
 */
export async function updateProfileExtras(args: {
  id: string;
  bio: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
}): Promise<RepoProfile | null> {
  if (!isProdDatastore) {
    const m = mem();
    for (const [h, p] of m.profiles) {
      if (p.id === args.id) {
        const updated: RepoProfile = { ...p, bio: args.bio, ctaLabel: args.ctaLabel, ctaUrl: args.ctaUrl };
        m.profiles.set(h, updated);
        return updated;
      }
    }
    return null;
  }
  const { data, error } = await client()
    .from("profiles")
    .update({ bio: args.bio, cta_label: args.ctaLabel, cta_url: args.ctaUrl })
    .eq("id", args.id)
    .select("*")
    .single();
  if (error) throw error;
  return data ? { id: data.id, handle: data.handle, displayName: data.display_name, avatarUrl: data.avatar_url, bio: data.bio ?? null, ctaLabel: data.cta_label ?? null, ctaUrl: data.cta_url ?? null, suspendedAt: data.suspended_at } : null;
}

// ------------------------------------------------------------- payment events
export async function recordPaymentEvent(ev: {
  provider: string;
  providerEventId: string;
  providerPaymentId: string;
  eventType: string;
  payloadHash?: string;
  status: "received" | "processed" | "ignored" | "error";
  error?: string;
}): Promise<void> {
  if (isProdDatastore) {
    // Insert-only: duplicate (provider, provider_event_id) surfaces as a
    // unique-violation so the webhook layer can treat it as idempotent
    // delivery. Upsert would silently swallow the duplicate and break that
    // signal.
    const { error } = await client().from("payment_events").insert({
      provider: ev.provider,
      provider_event_id: ev.providerEventId,
      provider_payment_id: ev.providerPaymentId,
      event_type: ev.eventType,
      payload_hash: ev.payloadHash ?? null,
      status: ev.status,
      error: ev.error ?? null,
      processed_at: new Date().toISOString(),
    });
    if (error) throw error;
    return;
  }
  const key = `${ev.provider}:${ev.providerEventId}`;
  if (mem().paymentEvents.has(key)) throw new Error("duplicate key value violates unique constraint \"payment_events_provider_provider_event_id_key\"");
  mem().paymentEvents.set(key, {
    id: crypto.randomUUID(),
    provider: ev.provider,
    providerEventId: ev.providerEventId,
    providerPaymentId: ev.providerPaymentId,
    eventType: ev.eventType,
    status: ev.status,
    createdAt: new Date().toISOString(),
  });
}

export async function getPaymentEvent(provider: string, providerEventId: string): Promise<{
  provider: string;
  providerEventId: string;
  providerPaymentId: string;
  eventType: string;
  status: string;
} | null> {
  if (isProdDatastore) {
    const { data, error } = await client()
      .from("payment_events")
      .select("provider, provider_event_id, provider_payment_id, event_type, status")
      .eq("provider", provider)
      .eq("provider_event_id", providerEventId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      provider: String(data.provider),
      providerEventId: String(data.provider_event_id),
      providerPaymentId: String(data.provider_payment_id),
      eventType: String(data.event_type),
      status: String(data.status),
    };
  }
  const ev = mem().paymentEvents.get(`${provider}:${providerEventId}`);
  if (!ev) return null;
  return {
    provider: ev.provider,
    providerEventId: ev.providerEventId,
    providerPaymentId: ev.providerPaymentId,
    eventType: ev.eventType,
    status: ev.status,
  };
}

export async function markPaymentEventStatus(provider: string, providerEventId: string, status: "processed" | "ignored" | "error", error?: string): Promise<void> {
  if (isProdDatastore) {
    const { error: err } = await client()
      .from("payment_events")
      .update({ status, error: error ?? null, processed_at: new Date().toISOString() })
      .eq("provider", provider)
      .eq("provider_event_id", providerEventId);
    if (err) throw err;
    return;
  }
  const ev = mem().paymentEvents.get(`${provider}:${providerEventId}`);
  if (ev) ev.status = status;
}

export async function isReservedInDb(domain: string): Promise<boolean> {
  if (!isProdDatastore) return false;
  try {
    const { data } = await client().from("reserved_domains").select("domain").eq("domain", domain).maybeSingle();
    return !!data;
  } catch {
    // If the reserved_domains table is missing, fail open but log.
    return false;
  }
}

export async function isDomainReserved(domain: string): Promise<boolean> {
  // Static blocklist (always) + operator-managed DB blocklist (prod).
  const { evaluateDomain } = await import("./domains.ts");
  if (evaluateDomain(domain).reason === "reserved") return true;
  return isReservedInDb(domain);
}

// ------------------------------------------------------- demo seeding (non-prod)
export function seedDemoMarket(items: Array<{ domain: string; holderHandle: string; priceCents: number }>): void {
  if (isProdDatastore) return; // production never fabricates purchases (§41)
  const m = mem();
  // Idempotent: module-level seeding runs on every SSR render in dev — don't
  // duplicate sales or overwrite newer holder state.
  for (const item of items) {
    if (m.domains.has(item.domain)) continue;
    const now = new Date().toISOString();
    // Handles are stored bare (no leading @) everywhere; strip if a caller included it.
    const handle = item.holderHandle.replace(/^@+/, "").toLowerCase();
    const userId = `demo-${handle}`;
    const sale: RepoSale = {
      id: crypto.randomUUID(),
      domain: item.domain,
      buyerUserId: userId,
      buyerHandle: handle,
      previousHolderHandle: null,
      previousPriceCents: 0,
      priceCents: item.priceCents,
      domainVersion: 1,
      providerPaymentId: `demo-${item.domain}-${item.priceCents}`,
      createdAt: now,
    };
    m.domains.set(item.domain, {
      domain: item.domain,
      holderUserId: sale.buyerUserId,
      holderHandle: handle,
      priceCents: item.priceCents,
      version: 1,
      claimedAt: now,
      updatedAt: now,
    });
    m.sales.push(sale);
    if (!m.profiles.has(handle)) {
      m.profiles.set(handle, { id: userId, handle, displayName: null, avatarUrl: null, bio: null, ctaLabel: null, ctaUrl: null, suspendedAt: null });
    }
  }
}
