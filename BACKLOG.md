# Backlog — parallel work distribution

> How to finish the remaining production work quickly. Each lane can be taken
> by a different person/agent without blocking the others. Do the owner-gated
> lane first — everything else depends on it.

Status: `code` = work to do in this repo · `owner` = needs accounts/credentials/legal · `verify` = run on a real deployment. Current evidence is recorded in `LAUNCH_CHECKLIST.md` and `INTEGRATION_NOW.md`.

## Lane A — Owner-gated infra (do first, blocks all real-money verification)

| # | Task | Type | Owner | Notes |
|---|------|------|-------|-------|
| A1 | Verify the existing **Supabase** project + hosted hardening state; apply only missing migrations if any | owner | repo owner | **Staging verified** for project, migrations, health, and auth; hosted Postgres/backup CLI access remains Owner blocked. `INTEGRATION_NOW.md` · `DEPLOY.md §1` |
| A2 | Enable **Supabase Auth** providers (Google OAuth + email magic link) + set Site URL + redirect URLs | owner | owner | **Staging verified** for Google OAuth, callback, welcome, logout/re-login, and saved `@harshit` handle |
| A3 | Enable **Supabase Realtime**; keep PITR off during free beta and test logical backups before real money | owner | owner | **Staging verified** for a live two-session market update; the logical backup test remains Owner blocked by authenticated database access. `DEPLOY.md §7` |
| A4 | Create one free **Upstash Redis** DB for the designated beta environment and set `UPSTASH_REDIS_REST_URL/TOKEN` there | owner | owner | **Staging verified (partial)**: `priced-beta-redis` is wired to Vercel Production, direct Redis checks pass, and authenticated handle plus same-domain quote bursts return 429 without 5xx. Checkout/user/IP/domain matrix remains. `DEPLOY.md §3`; ordinary untrusted previews stay secret-free |
| A5 | Get **test** credentials + create/reuse approved PWYW one-time product → copy `DODO_PAYMENTS_PRODUCT_ID` | owner | owner | **Staging verified** for configured Dodo Test Mode product and real checkout. `DEPLOY.md §2` · `DODO_COMPLIANCE_GATE.md` |
| A6 | Add Dodo webhook `https://<domain>/api/webhooks/payments` (test endpoint) → copy `DODO_PAYMENTS_WEBHOOK_KEY` | owner | owner | **Staging verified (partial)**: signed success, failed payment, duplicate-event replay/idempotency, cancelled-checkout UI behavior, tax-inclusive amount handling, stale/wrong-amount refunds, and endpoint delivery reached the hosted endpoint; provider `payment.cancelled` and the remaining matrix cases are still outstanding. Subscribe to `payment.succeeded/failed/cancelled` |
| A7 | **Vercel**: project rename is complete; configure designated beta env separation (Production vs Preview) | owner | owner | **Staging verified**: existing project is renamed `priced`, `main` deploys, and privileged secrets remain Production-only. `DEPLOY.md §3` |
| A8 | Set `SENTRY_DSN` + **Vercel Log Drains** + `/api/health` uptime check; alert on `refund_failed`, `takeover_finalization_error`, `webhook_*_failed`, `webhook_signature_invalid` spikes | owner | owner | **External provider blocked** for Vercel Log Drains on Hobby (`Add Drain` disabled); health endpoints are ready for an authorized external uptime check. `DEPLOY.md §8` |
| A9 | Turnstile widget (optional) + Dodo fraud/risk features in dashboard | owner | owner | `DEPLOY.md §3` |

## Lane B — Staging verification (needs Lane A preview env)

| # | Task | Type | Depends | How |
|---|------|------|---------|-----|
| B1 | **Dodo sandbox matrix** (§76 gate) — complete cancel/duplicate/stale/simultaneous/refund-failure/missing-metadata/wrong-amount/outage cases on the hosted beta with test keys | verify | A5–A7 | **Staging verified (partial)** for success/fail/signed webhook/duplicate replay/cancelled-checkout UI/atomic finalization, tax-inclusive amount handling, and stale/wrong-amount refunds; complete the provider `payment.cancelled` event and remaining cases per `DEPLOY.md §4` and record no unexplained states |
| B2 | **Real Postgres concurrency** — run `tests/integration/postgres.finalize.test.ts` against the real Priced Supabase project | verify | A1 | **Owner blocked** until authenticated database access is available: `RUN_POSTGRES_TESTS=1 NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run test:postgres`; dockerized equivalent remains CI-green |
| B3 | **Staging smoke** — health, analytics taxonomy, CSRF guards, auth redirect, routing | verify | A7 | **Staging verified**: `STAGING_URL=https://internet-price-tag.vercel.app npm run smoke:staging` passes all 9 checks |
| B4 | **Realtime** + browser loop on staging — search → domain → quote → checkout → webhook → sale → receipt → profile → market update → share | verify | A1–A7 | **Staging verified** for hosted success journey, profile, analytics, receipt, share, and live two-session Realtime update; the full payment/race matrix remains. `tests/browser/loop.spec.ts` against `STAGING_URL` + manual check |
| B5 | **Rate-limit across instances** — prove 429s from Upstash (burst quote/checkout/handle) on the hosted beta with Redis | verify | A4 | **Staging verified (partial)**: Redis PING/EVAL, authenticated handle burst, and same-domain quote burst pass with 429/no 5xx; complete checkout/user/IP/domain matrix. `tests/load/race.mjs` already accounts for 429s. |

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
