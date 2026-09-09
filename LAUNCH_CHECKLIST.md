# Launch Checklist (§78 + user list item 19)

Status legend — demo-mode tests passing is NOT production-done:

- ✅ implemented + tested in this repo
- 🟡 code done, needs production/staging verification
- 🔒 owner/infrastructure step (accounts, credentials, legal, humans)
- ❌ incomplete — real work remains

## Product

- ✅ Homepage/market with premise, search, market cap metric
- ✅ Domain pages: holder, price, transparent math, history, unclaimed state
- ✅ Search with full URL/domain normalization and server-side eligibility
- ✅ Takeover flow: quote (5-min TTL) → confirm → checkout → atomic finalization
- ✅ Success receipt with share artifacts and challenger hand-off
- 🟡 UI/device review at 375px/430px/tablet/desktop, long domains, large prices, all states (item 11 — not yet done on a real deployment)
- 🟡 OG cards render in build; not yet validated in the X card validator (item 13)

## Market

- ✅ Atomic transaction: `finalize_takeover` RPC, row-locked, version-checked (db/schema.sql)
- ✅ Immutable sales history (append-only; admin corrections via ops SQL only)
- ✅ Concurrency verified in-memory: unit/integration suite, browser E2E, live-HTTP race test (12 racers → exactly one winner)
- 🟡 `finalize_takeover` RPC never yet run against real Postgres (item 7 — needs Supabase + 10–25 concurrent attempts)
- 🟡 Realtime wired (Supabase Realtime when configured, polling fallback) — needs verification against the real project

## Payments (Dodo is the launch default)

- ✅ Provider abstraction with Dodo implementation (PWYW checkout sessions, Standard-Webhooks verify, refunds API); Stripe kept as optional adapter
- ✅ Webhook retry contract: unique-violation-only dedupe, 500 on DB failure, idempotent checkout per quote, deterministic stale-quote refunds
- ✅ Duplicate-event handling verified by tests
- 🟡 Full Dodo sandbox matrix never yet run (item 8: success/fail/cancel/duplicate/stale/simultaneous/refund-failure/missing-metadata/wrong-amount/outage)
- 🔒 Dodo permission check for symbolic-status product → test credentials → live keys + webhook secret + PWYW product id in Vercel (owner, after §21 check)
- 🔒 Dodo fraud/risk features enabled in the dashboard (owner)

## Safety

- ✅ Distributed rate limiting code (Upstash Redis, fail-closed) with account + IP limits; in-memory fallback for local/CI
- 🟡 Upstash database not yet created; limits never yet exercised across instances
- ✅ Reserved domains enforced server-side at quote creation + inside `finalize_takeover`; ops SQL to manage
- ✅ User suspension enforced at quote creation, checkout and finalization
- ✅ Turnstile checkout validation (fail-closed when configured; pass-through in demo/CI)
- ✅ Handle validation + impersonation blocklist + `HANDLE_TAKEN` race handling
- ✅ IDN/punycode (homograph) rejection + explicit V1 suffix-policy docs (DEPLOY.md §9); TLD allowlist remains the V1 explicit limit
- 🔒 Turnstile widget creation + Dodo fraud tooling (owner)

## Trust

- ✅ Terms, Privacy, Refunds pages (plain-language) + symbolic-status language everywhere ("holder", non-affiliation, no-payout, immediate-takeover-risk)
- 🔒 Professional legal review of copy + Dodo product-classification confirmation (§49/item 16 — strongly advised before real money)

## Reliability

- ✅ Structured JSON logs for all §56 critical payment events + payload hashes (no secret logging); optional Sentry forwarding for error-level events when `SENTRY_DSN` is set (still needs owner Log Drain + health-check monitoring)
- ✅ CI runs lint, typecheck, unit, concurrency, browser and race tests on every push; new checks: migrations structure determinism + analytics taxonomy + `/api/health` liveness/readiness (`?check=db`)
- ✅ Versioned migrations in `supabase/migrations/` + portable `db/*.sql` (DEPLOY.md §1; `supabase/migrations/README.md`) — CI verifies fresh-DB can boot from these
- 🟡 Alert rules documented (DEPLOY.md §8) but no alert destination wired yet (owner to add Vercel Log Drains + `/api/health` uptime check)
- 🔒 Sentry/Vercel alerts + Supabase backups/PITR (owner settings; recovery runbook in DEPLOY.md §7)

## Distribution

- ✅ Dynamic OG cards for domains and receipts
- ✅ X share intent with default copy + copy post/link buttons
- ✅ Share attribution (`?via=`) and `share_visit` analytics event
- ✅ SEO: sitemap of claimed domains only, robots exclusions, noindex empty pages
- 🟡 `share_visit → takeover_click → checkout → purchase` funnel easing verified in code only, not against live traffic (item 14/22)

## Analytics

- ✅ Persistent funnel sink: `analytics_events` table + `POST /api/analytics` (+ server `persistAnalyticsEvent`); `track()` best-effort mirrors there (no PII/secrets)
- ✅ Taxonomy covers homepage_viewed → share_visit → challenger purchase funnel (item 22 measurable once infra has traffic)

## Owner gates remaining (in order)

1. Supabase project + schema + auth providers + Realtime + backups (DEPLOY.md §1)
2. Upstash Redis database + envs (Preview + Production)
3. Dodo permission check → test credentials → live keys + webhook + PWYW product (DEPLOY.md §2)
4. Vercel deploy with env separation (DEPLOY.md §3) + custom domain
5. §76 Dodo sandbox payment gate on preview (DEPLOY.md §4) + prod-DB concurrency tests (item 7)
6. Legal review of policy pages and checkout language
7. Closed beta with 10–20 people proving repeat competition (§77) → public announcement
