# Backlog — parallel work distribution

> How to finish the remaining production work quickly. Each lane can be taken
> by a different person/agent without blocking the others. Do the owner-gated
> lane first — everything else depends on it.

Status: `code` = work to do in this repo · `owner` = needs accounts/credentials/legal · `verify` = run on a real deployment. Current evidence is recorded in `LAUNCH_CHECKLIST.md` and `INTEGRATION_NOW.md`.

## Lane A — Owner-gated infra (do first, blocks all real-money verification)

| # | Task | Type | Owner | Notes |
|---|------|------|-------|-------|
| A1 | Verify the existing **Supabase** project + hosted hardening state; apply only missing migrations if any | owner | repo owner | **Staging verified** for project, migrations, health, auth, hosted logical backup dump/restore, and the real service-role RPC harness (all 8 tests passed). Managed backups remain unavailable on the Free Plan. `INTEGRATION_NOW.md` · `DEPLOY.md §1` |
| A2 | Enable **Supabase Auth** providers (Google OAuth + email magic link) + set Site URL + redirect URLs | owner | owner | **Staging verified** for Google OAuth, callback, welcome, logout/re-login, and saved `@harshit` handle |
| A3 | Enable **Supabase Realtime**; keep PITR off during free beta and test logical backups before real money | owner | owner | **Staging verified** for a live two-session market update and a hosted logical schema/data dump restored into isolated PostgreSQL 17. Supabase Free Plan explicitly excludes managed project backups; PITR remains off. `DEPLOY.md §7` |
| A4 | Create one free **Upstash Redis** DB for the designated beta environment and set `UPSTASH_REDIS_REST_URL/TOKEN` there | owner | owner | **Staging verified**: `priced-beta-redis` is wired to Vercel Production, direct Redis checks pass, and clean concurrent hosted bursts hit every configured user/IP/domain ceiling with the next request returning 429 and no 5xx. Disposable Auth users, profiles, and quotes were removed. `DEPLOY.md §3`; ordinary untrusted previews stay secret-free |
| A5 | Get **test** credentials + create/reuse approved PWYW one-time product → copy `DODO_PAYMENTS_PRODUCT_ID` | owner | owner | **Staging verified** for configured Dodo Test Mode product and real checkout. `DEPLOY.md §2` · `DODO_COMPLIANCE_GATE.md` |
| A6 | Add Dodo webhook `https://<domain>/api/webhooks/payments` (test endpoint) → copy `DODO_PAYMENTS_WEBHOOK_KEY` | owner | owner | **Staging verified (partial)**: signed success, failed payment, duplicate-event replay/idempotency, provider replay of a successful event with a new HTTP 200 delivery, synthetic provider `payment.failed` and `payment.cancelled` delivery with HTTP 200, a real customer-cancellation state transition with `payment.cancelled` delivered HTTP 200, fail-closed synthetic missing-metadata/refund-failure retry behavior, a real missing-metadata payment with successful full refund and no matching sale, cancelled-checkout UI behavior, tax-inclusive amount handling, stale/wrong-amount refunds, endpoint delivery reached the hosted endpoint, and the provider-outage path. The endpoint currently subscribes to all 12 required payment, refund, and dispute events; asynchronous refund statuses are fail-closed and reconciled through `refund.succeeded`/`refund.failed`. The outage probe returned hosted `502 checkout_failed` before provider payment creation; the temporary override was removed and normal health/smoke checks passed. A ten-way hosted race produced exactly one takeover and nine stale quotes, but Dodo Test Mode returned `INSUFFICIENT_WALLET_FUNDS` for two refund attempts after seven completed; the Account Statement showed a $5.90 refund, +$0.90 tax reversal, and -$1.00 refund fee per completed refund, leaving only $1.49 total balance. Complete refund closure is **External provider blocked**. The 25-way hosted payment race remains outstanding. Subscribe to `payment.succeeded`, `payment.failed`, `payment.cancelled`, `refund.succeeded`, `refund.failed`, and the seven dispute lifecycle events |
| A7 | **Vercel**: project rename is complete; configure designated beta env separation (Production vs Preview) | owner | owner | **Staging verified**: existing project is renamed `priced`, `main` deploys, and privileged secrets remain Production-only. `DEPLOY.md §3` |
| A8 | Set `SENTRY_DSN` + **Vercel Log Drains** + `/api/health` uptime check; alert on `refund_failed`, `takeover_finalization_error`, `webhook_*_failed`, `webhook_signature_invalid` spikes | owner | owner | **Implemented (partial)**: `.github/workflows/staging-health.yml` checks liveness and Supabase readiness every 15 minutes with GitHub Actions failure notifications. **External provider blocked** remains for Vercel Hobby log-drain controls (`Add Drain`, `Add Rule`, and `Add Webhook` disabled). `DEPLOY.md §8` |
| A9 | Turnstile widget (optional) + Dodo fraud/risk features in dashboard | owner | owner | `DEPLOY.md §3` |

## Lane B — Staging verification (needs Lane A preview env)

| # | Task | Type | Depends | How |
|---|------|------|---------|-----|
| B1 | **Dodo sandbox matrix** (§76 gate) — complete cancel/duplicate/stale/simultaneous/refund-failure/missing-metadata/wrong-amount/outage cases on the hosted beta with test keys | verify | A5–A7 | **Staging verified (partial)** for success/fail/signed webhook/duplicate replay/provider replay with HTTP 200/synthetic `payment.failed` and `payment.cancelled` delivery with HTTP 200/a real customer-cancellation state transition with `payment.cancelled` delivered HTTP 200/fail-closed synthetic missing-metadata/refund-failure retry behavior/a real missing-metadata payment with successful full refund and no matching sale/cancelled-checkout UI/atomic finalization, tax-inclusive amount handling, stale/wrong-amount refunds, and provider outage. The outage probe returned hosted `502 checkout_failed` before provider payment creation; the temporary override was removed and normal health/smoke checks passed. A ten-way hosted race produced exactly one takeover and nine stale quotes, but two Dodo Test Mode refund attempts were blocked by `INSUFFICIENT_WALLET_FUNDS` after seven completed; direct dashboard retries reproduced the same error and the Test Mode Account Statement showed only $1.49 total balance. Complete refund closure is **External provider blocked**. The 25-way hosted payment race remains outstanding. |
| B2 | **Real Postgres concurrency** — run `tests/integration/postgres.finalize.test.ts` against the real Priced Supabase project | verify | A1 | **Staging verified**: the real service-role harness passed all 8 tests, and a bounded hosted database pool separately submitted 10 first claims (1 `OK`, 9 `STALE_QUOTE`) and 25 held-domain takeovers (1 `OK`, 24 `STALE_QUOTE`), then cleaned both test domains. The protected key was held transiently in memory and never printed or stored. `npm run test:postgres` now points to the correct integration harness; hosted logical backup dump/restore is documented in `DEPLOY.md §7`. |
| B3 | **Staging smoke** — health, analytics taxonomy, CSRF guards, auth redirect, routing | verify | A7 | **Staging verified**: `STAGING_URL=https://internet-price-tag.vercel.app npm run smoke:staging` passes all 9 checks |
| B4 | **Realtime** + browser loop on staging — search → domain → quote → checkout → webhook → sale → receipt → profile → market update → share | verify | A1–A7 | **Staging verified** for hosted success journey, profile, analytics, receipt, share, and live two-session Realtime update; the full payment/race matrix remains. `tests/browser/loop.spec.ts` against `STAGING_URL` + manual check |
| B5 | **Rate-limit across instances** — prove 429s from Upstash (burst quote/checkout/handle) on the hosted beta with Redis | verify | A4 | **Staging verified**: clean concurrent hosted bursts verified handle user/IP `5/15`, profile user `10`, quote user/IP/domain/user+domain `30/60/30/8`, and checkout user/IP `20/30`; each next request returned `429 rate_limited` with no 5xx. `tests/load/race.mjs` already accounts for 429s. |

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
