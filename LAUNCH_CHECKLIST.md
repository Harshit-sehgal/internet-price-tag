# Launch Checklist (§78)

Status of every public-launch requirement. ✅ = implemented and tested in this
repo. 🔒 = owner-gated, no code remaining. Detailed steps: [DEPLOY.md](./DEPLOY.md).

## Product

- ✅ Homepage/market with premise, search, market cap metric
- ✅ Domain pages: holder, price, transparent math, history, unclaimed state
- ✅ Search with full URL/domain normalization and server-side eligibility
- ✅ Takeover flow: quote (5-min TTL) → confirm → checkout → atomic finalization
- ✅ Success receipt with share artifacts and challenger hand-off

## Market

- ✅ Atomic transaction: `finalize_takeover` RPC, row-locked, version-checked (db/schema.sql)
- ✅ Immutable sales history (append-only table; admin corrections via ops SQL only)
- ✅ Concurrency verified at three layers: unit/integration suite, browser E2E,
  live-HTTP race test (12 and 25 concurrent racers → exactly one winner every run)

## Payments

- ✅ Provider abstraction with Dodo implementation (launch default; charge+refund fallback) + Stripe kept as optional adapter
- ✅ Live checkout path, signed webhook (Standard Webhooks verification), idempotency at event AND payment level
- ✅ Refund path for stale quotes; never re-applied to another price (§50)
- ✅ Duplicate-event handling verified by tests and race test
- 🟡 Webhook retry contract hardened in code (unique-violation-only dedupe, 500-on-DB-failure, idempotent checkout) — needs production verification against real Supabase + Dodo sandbox
- 🔒 Live Dodo keys + webhook secret + PWYW product id in Vercel (owner, after §21 permission check)
- 🔒 §76 sandbox gate executed on a preview deployment with Dodo test credentials (owner runbook)

## Safety

- ✅ Rate limiting: per-account + per-IP on quotes, checkout, handle claims
- ✅ Reserved domains enforced server-side at quote creation; ops SQL to manage
- ✅ User suspension enforced at quote creation, checkout and finalization
- ✅ Security review done: webhook signature + replay, CSRF content-type guards,
  open-redirect guard, RLS lockdown (clients read-only), no service keys client-side
- ✅ Basic bot protection: optional Cloudflare Turnstile (invisible) on checkout —
  server fail-closed when configured, pass-through in demo/CI; unit-tested
- 🔒 Payment-provider fraud tooling enabled in the Dodo dashboard (owner)

## Trust

- ✅ Terms, Privacy, Refunds pages (plain-language; professional review pending)
- ✅ Symbolic-status language everywhere; "holder" not "owner"; no-affiliation notice
- ✅ Non-refundability after successful takeover communicated pre-purchase (§51)
- 🔒 Professional legal review of copy + product classification (§49, strongly advised)

## Reliability

- ✅ Structured JSON logs for all §56 critical payment events
- ✅ CI runs lint, typecheck, unit, concurrency, browser and race tests on every push
- 🔒 Error/uptime monitoring wired to the structured logs (e.g. Sentry + Vercel alerts)
- 🔒 Production database backups/pITR enabled in Supabase (owner setting)

## Distribution

- ✅ Dynamic OG cards for domains and receipts
- ✅ X share intent with default copy + copy post/link buttons
- ✅ Share attribution (`?via=`) and `share_visit` analytics event
- ✅ SEO: sitemap of claimed domains only, robots exclusions, noindex empty pages

## Owner gates remaining (in order)

1. Supabase project + schema + auth providers (DEPLOY.md §1)
2. Dodo permission check → live keys + webhook + PWYW product (DEPLOY.md §2)
3. Vercel deploy with env separation (DEPLOY.md §3)
4. §76 sandbox payment gate on preview (DEPLOY.md §4)
5. Legal review of policy pages and checkout language
6. Closed beta (§77) → public announcement
