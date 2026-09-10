# Backlog — parallel work distribution

> How to finish the remaining production work quickly. Each lane can be taken
> by a different person/agent without blocking the others. Do the owner-gated
> lane first — everything else depends on it.

Status: `code` = work to do in this repo · `owner` = needs accounts/credentials/legal · `verify` = run on a real deployment.

## Lane A — Owner-gated infra (do first, blocks all real-money verification)

| # | Task | Type | Owner | Notes |
|---|------|------|-------|-------|
| A1 | Create **Supabase** project + apply migrations (`npx supabase db push` or `db/schema.sql` → `db/schema-extended.sql`) | owner | repo owner | `DEPLOY.md §1` |
| A2 | Enable **Supabase Auth** providers (Google OAuth + email magic link) + set Site URL + redirect URLs | owner | owner | Needs Google Cloud OAuth client |
| A3 | Enable **Supabase Realtime** + **backups/PITR** (7-day window) | owner | owner | `DEPLOY.md §7` |
| A4 | Create **Upstash Redis** DB + set `UPSTASH_REDIS_REST_URL/TOKEN` in Vercel Preview + Production (separate DBs ideally) | owner | owner | `DEPLOY.md §3` |
| A5 | **Dodo permission check** for symbolic-status product (confirm not restricted) → get **test** credentials + create PWYW one-time product → copy `DODO_PAYMENTS_PRODUCT_ID` | owner | owner (+ legal if unclear) | `DEPLOY.md §2` · spec §21 |
| A6 | Add Dodo webhook `https://<domain>/api/webhooks/payments` (test endpoint) → copy `DODO_PAYMENTS_WEBHOOK_KEY` | owner | owner | Subscribe to `payment.succeeded/failed/cancelled` |
| A7 | **Vercel**: rename project `internet-price-tag` → `priced` (runbook in DEPLOY.md §3), env separation (Production vs Preview), custom domain | owner | owner | `DEPLOY.md §3` — never share prod DB/webhook with previews. Env matrix documented in `.env.example` |
| A8 | Set `SENTRY_DSN` + **Vercel Log Drains** + `/api/health` uptime check; alert on `refund_failed`, `takeover_finalization_error`, `webhook_*_failed`, `webhook_signature_invalid` spikes | owner | owner | `DEPLOY.md §8` |
| A9 | Turnstile widget (optional) + Dodo fraud/risk features in dashboard | owner | owner | `DEPLOY.md §3` |

## Lane B — Staging verification (needs Lane A preview env)

| # | Task | Type | Depends | How |
|---|------|------|---------|-----|
| B1 | **Dodo sandbox matrix** (§76 gate) — success/fail/cancel/duplicate/stale/simultaneous/refund-failure/missing-metadata/wrong-amount/outage on a preview deploy with test keys | verify | A5–A7 | `DEPLOY.md §4` — record results, no unexplained states |
| B2 | **Real Postgres concurrency** — run `tests/integration/postgres.finalize.test.ts` against preview Supabase | verify | A1 | `RUN_POSTGRES_TESTS=1 NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run test:postgres` (also covers `holder_analytics` RPC + `credit_ledger` migration; dockerized equivalent: `npm run test:pg` = 10 cases, CI-green) |
| B3 | **Staging smoke** — health, analytics taxonomy, CSRF guards, auth redirect, routing | verify | A7 | `STAGING_URL=https://<preview>.vercel.app npm run smoke:staging` (`scripts/staging-smoke.mjs`) |
| B4 | **Realtime** + browser loop on staging — search → domain → quote → checkout → webhook → sale → receipt → profile → market update → share | verify | A1–A7 | `tests/browser/loop.spec.ts` against `STAGING_URL` + manual check |
| B5 | **Rate-limit across instances** — prove 429s from Upstash (burst quote/checkout/handle) on preview with Redis | verify | A4 | Hit `POST /api/quotes` / `POST /api/checkout` 30× fast; expect 429s, no 500s. `tests/load/race.mjs` already accounts for 429s. |

## Lane C — Code hardening (can run in parallel, no infra needed)

| # | Task | Type | Files | Done |
|---|------|------|-------|------|
| C1 | Layered rate limits (domain + user+domain) + 4 KiB payload guard on quotes | code | `src/app/api/quotes/route.ts` | ✅ |
| C2 | 4 KiB payload guard + body-size check on checkout | code | `src/app/api/checkout/route.ts` | ✅ |
| C3 | IP-layer rate limit + 4 KiB payload guard on handle | code | `src/app/api/handle/route.ts` | ✅ |
| C4 | 64 KiB payload guard on webhooks | code | `src/app/api/webhooks/payments/route.ts` | ✅ |
| C5 | Security headers (HSTS, nosniff, DENY framing, referrer, permissions) | code | `next.config.mjs` | ✅ |
| C6 | Real-Postgres test harness (skips in CI) | code | `tests/integration/postgres.finalize.test.ts` | ✅ |
| C7 | Staging smoke script + `smoke:staging` / `test:postgres` scripts | code | `scripts/staging-smoke.mjs`, `package.json` | ✅ |
| C8 | Branch protection doc + required CI gate | code | `.github/BRANCH_PROTECTION.md`, `.github/workflows/ci.yml` | ✅ |
| C9 | Holder analytics SQL aggregation (`holder_analytics` RPC + support indexes) replacing bounded Node-side counting | code | `src/lib/holder-analytics.ts`, `supabase/migrations/20260910000003_*` | ✅ |
| C10 | Analytics session ids: per-tab sessionStorage id in `track()` (privacy-safe; feeds unique-session metrics) | code | `src/lib/analytics.ts` | ✅ |
| C11 | Open-redirect hardening on `/welcome` next param + CTA protocol regression tests | code | `src/app/welcome/page.tsx`, `tests/integration/cta.test.ts` | ✅ |
| C12 | Repository cleanup: PR #1 closed as superseded, stale branches removed, old repo refs updated | code/admin | `.github/BRANCH_PROTECTION.md`, docs | ✅ |

Remaining optional code follow-ups (pick up if time, not blocking launch):
- Add `STAGING_URL` preview smoke as a required GitHub check (needs Vercel preview URL plumbing).
- Promote in-memory concurrency tests to run against a throwaway Supabase in CI nightly (needs `SUPABASE_SERVICE_ROLE_KEY` secret).

## Lane D — Go-live gates (after B is green)

| # | Task | Type | Notes |
|---|------|------|-------|
| D1 | Professional **legal review** of `terms` / `privacy` / `refunds` + Dodo product-classification confirmation | owner | Spec §49 / §21 — strongly advised before real money |
| D2 | Swap Dodo **test → live** keys + webhook secret; switch `DODO_PAYMENTS_MODE=live` in Production only | owner | Keep Preview on test keys |
| D3 | **Closed beta** with 10–20 people proving repeat competition (spec §77) | owner+verify | Watch Vercel logs for `takeover_succeeded`, `refund_failed`, etc. |
| D4 | Public announcement | owner | Only after §76 gate + D1–D3 |

## Quick start for a new agent

1. Read `LAUNCH_CHECKLIST.md` (honest ✅/🟡/🔒 legend) and `DEPLOY.md`.
2. Pick a lane above. Lanes A/B are sequential; Lane C is already done.
3. For code changes: `npm run typecheck && npm run lint && npm run test && npm run build` must stay green. Don't add deps without need.
4. Owner steps need credentials — don't mock them. Mark them 🔒 in the checklist until actually done.
