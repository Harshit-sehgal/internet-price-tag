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

## Priced consolidation (V2)

- ✅ Brand migration: Priced everywhere public (header, metadata, OG cards,
  share copy, checkout descriptions, legal pages, docs); old name gone from
  user-facing surfaces; `priced` added to the reserved-handle list
- ✅ Holder profiles: bio, optional CTA, currently/previously held, derived
  stats (largest tag, most contested), takeover history (`/u/[handle]`)
- ✅ Holder CTA: https-only validation, safe external links (noopener
  noreferrer nofollow), shown on profile + held tags' domain pages,
  `cta_clicked` tracking (`/api/profile`, `src/lib/cta.ts`)
- ✅ Permanent history: provenance ledger with previous holder, price delta,
  first-claim mark, current-holder flag, takeover count, highest price,
  total paid (`src/components/HistoryLedger.tsx`)
- ✅ Holder analytics: real COUNTs from `analytics_events` (tag views,
  unique sessions, profile views, share visits, CTA clicks, by-domain,
  by-day) at owner-only `/u/[handle]/analytics`; honest empty states when
  no datastore or no traffic; no fabricated numbers anywhere
- ✅ New analytics events in taxonomy: `tag_viewed`, `profile_viewed`,
  `cta_clicked`, `profile_updated` — all wired to real emit sites
- ✅ Discovery: Fastest Rising (challenger-driven rises only, 7-day window)
  and Newly Claimed (first claims only), both derived from the immutable
  ledger with tests; no fabricated popularity
- ✅ Share: native share sheet where supported, X intent, copy post/link,
  `?via=` attribution retained
- ✅ Receipt + OG cards: Priced branding, previous holder, next challenge
  price when still held, https/env-based host (defaults to priced.game)
- 🔒 Priced Credits: spec + ledger migration exist, flag OFF, no surface
  (docs/CREDITS.md). Activation requires the consistency gates listed there
- ✅ Public copy contains no em/en dashes; AI-marketing patterns removed

## Market

- ✅ Atomic transaction: `finalize_takeover` RPC, row-locked, version-checked (db/schema.sql)
- ✅ Immutable sales history (append-only; admin corrections via ops SQL only)
- ✅ Concurrency verified in-memory: unit/integration suite, browser E2E, live-HTTP race test (12 racers → exactly one winner)
- ✅ Real-Postgres harness exists: `tests/integration/postgres.finalize.test.ts` + `npm run test:postgres` (skips in CI, 8 cases). Run in staging: `RUN_POSTGRES_TESTS=1 NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run test:postgres` — then 🟡 until actually run
- 🟡 Realtime wired (Supabase Realtime when configured, polling fallback) — needs verification against the real project

## Payments (Dodo is the launch default)

- ✅ Provider abstraction with Dodo implementation (PWYW checkout sessions, Standard-Webhooks verify, refunds API); Stripe kept as optional adapter
- ✅ Webhook retry contract: unique-violation-only dedupe, 500 on DB failure, idempotent checkout per quote, deterministic stale-quote refunds
- ✅ Duplicate-event handling verified by tests
- 🟡 Full Dodo sandbox matrix never yet run (item 8: success/fail/cancel/duplicate/stale/simultaneous/refund-failure/missing-metadata/wrong-amount/outage) — staging smoke exists (`npm run smoke:staging`)
- 🔒 Dodo permission check for symbolic-status product → test credentials → live keys + webhook secret + PWYW product id in Vercel (owner, after §21 check)
- 🔒 Dodo fraud/risk features enabled in the dashboard (owner)

## Safety

- ✅ Distributed rate limiting code (Upstash Redis, fail-closed) with layered keys (account + IP + IP/handle + domain + user+domain); in-memory fallback for local/CI
- ✅ Payload guards: quotes/checkout/handle 4 KiB, webhooks 64 KiB, analytics 10 KiB, demo-sign 16 KiB
- ✅ Security headers: HSTS, nosniff, DENY framing, referrer, permissions-policy (`next.config.mjs`)
- 🟡 Upstash database not yet created; limits never yet exercised across instances — run `BACKLOG.md` Lane B5 after A4
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
- ✅ Staging smoke script `scripts/staging-smoke.mjs` (`npm run smoke:staging`) covers health, analytics, CSRF, auth redirect, routing
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

## Repo hardening

- ✅ Branch protection documented: `.github/BRANCH_PROTECTION.md` (require PR + `verify` job, no force-push, no deletion)
- ✅ Parallel work distribution: `BACKLOG.md` (4 lanes — infra, staging verification, code, go-live)

## Owner gates remaining (in order)

1. Supabase project + schema + auth providers + Realtime + backups (DEPLOY.md §1)
2. Upstash Redis database + envs (Preview + Production)
3. Dodo permission check → test credentials → live keys + webhook + PWYW product (DEPLOY.md §2)
4. Vercel deploy with env separation (DEPLOY.md §3) + custom domain — enable branch protection per `.github/BRANCH_PROTECTION.md`
5. §76 Dodo sandbox payment gate on preview (DEPLOY.md §4) + `npm run test:postgres` + `npm run smoke:staging` on preview URL
6. Legal review of policy pages and checkout language
7. Closed beta with 10–20 people proving repeat competition (§77) → public announcement
