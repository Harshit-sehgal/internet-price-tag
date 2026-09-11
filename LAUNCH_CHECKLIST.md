# Launch Checklist — Priced

One authoritative progress file (§41). Statuses are strict:

- **Implemented** — code exists in the repo
- **Locally verified** — ran on a developer machine
- **CI verified** — runs on every push to `main` via `.github/workflows/ci.yml`
- **Staging verified** — ran against the real preview environment with real services
- **Production verified** — ran against production with live credentials
- **Owner blocked** — requires accounts, credentials, legal, or humans; exact action documented
- **Deferred** — deliberately not for launch

Nothing is marked beyond the level actually evidenced.

## Product

| Item | Status | Evidence |
|---|---|---|
| Homepage/market, search, market-cap metric, discovery (Most Contested, Fastest Rising, Newly Claimed) | CI verified | `tests/browser/market.spec.ts`, `responsive.spec.ts`; discovery logic unit-tested in `tests/integration/discovery.test.ts` |
| Domain pages: holder, price, transparent math, provenance history (prev holder, deltas, first claims) | CI verified | `tests/browser/market.spec.ts`, `loop.spec.ts` |
| Takeover flow: quote (5-min TTL) → confirm → checkout → atomic finalization | CI verified | `tests/integration/*`, `tests/browser/loop.spec.ts` |
| Success receipt + share artifacts (X, copy, native share, `?via=` attribution) | CI verified | `tests/browser/loop.spec.ts`, `og.spec.ts` |
| Priced branding everywhere public | CI verified | `tests/browser/brand.spec.ts` asserts the old name is absent from every surface |
| UI/device review at 375/430/768/laptop/large | Locally verified (375/430/768 via CI) | `tests/browser/responsive.spec.ts`; real-device eyeball pass remains owner |
| OG cards (domain + receipt, Priced branded, prev holder + next price) | CI verified as routes | PNG rendering + headers asserted in `og.spec.ts`; X card validator check is owner-gated |

## Market correctness (money)

| Item | Status | Evidence |
|---|---|---|
| Integer-cent pricing, locked formula ($5 start, max($5, 1%)) | CI verified | `src/lib/game.test.ts` |
| Version-checked, row-locked atomic `finalize_takeover` RPC | CI verified (dockerized Postgres); Owner blocked for hosted verification | `tests/pg/finalize-rpc.test.ts`: 25-racer races → exactly one winner, losers STALE_QUOTE; real Supabase run requires authenticated database access |
| Immutable sales history (append-only) | CI verified | RPC inserts only; `db/ops.sql` documents correction procedure |
| In-memory mirror correctness (demo) | CI verified | `tests/integration/concurrency.test.ts` |
| Idempotent webhook handling (event + payment id), stale-quote refunds | CI verified | `tests/integration/webhook-safety.test.ts`, `dodo.test.ts` |

## Payments (Dodo primary, Stripe adapter retained)

| Item | Status | Evidence |
|---|---|---|
| Dodo provider: PWYW checkout, Standard-Webhooks verify, refunds | Implemented; CI-verified logic | `tests/integration/dodo.test.ts` (network stubbed) |
| Dodo permission check for symbolic-status product | Implemented | Owner confirmed Dodo product verification/approval; do not reopen unless Dodo requests it |
| Dodo sandbox matrix (success/fail/cancel/duplicate/stale/simultaneous/refund-failure/missing-metadata/wrong-amount/outage) | Staging verified (partial); Owner blocked for remaining cases | Real Test Mode success, declined payment, signed webhook acceptance, duplicate-event replay/idempotency, cancelled-checkout UI behavior, quote consumption, atomic finalization, Dodo tax-inclusive amount handling, and hosted stale/wrong-amount refunds are verified on the stable beta origin. A provider `payment.cancelled` event, retry/race/refund-failure, missing-metadata, and outage cases still require the full hosted exercise. Procedure: `DEPLOY.md` §4. |
| Live Dodo configuration | Owner blocked | DEPLOY.md §6 |

## Infrastructure

| Item | Status | Evidence |
|---|---|---|
| Supabase project + migrations + auth + Realtime + backups | Staging verified (auth/health/Realtime); Owner blocked for backup verification | Existing Priced project and hosted-hardening migrations are the source of truth; Site URL and `/auth/callback` are configured, Google login reaches the welcome flow, `@harshit` is saved, and `/api/health?check=db` is healthy. A live two-session Realtime market update is verified; a pre-money logical backup test remains blocked by authenticated database access. See `INTEGRATION_NOW.md`. |
| Real-Postgres RPC concurrency (10 + 25 racers) | CI verified; Owner blocked for hosted verification | `npm run test:pg` passes locally/CI; the hosted run requires authenticated database access and the 10/25 hosted challenger race remains outstanding |
| Upstash Redis + distributed rate limits | Staging verified (partial) | Free-tier database `priced-beta-redis` is created in the new Upstash account (`us-west-1`); REST URL/token are configured only in Vercel Production and the Redis-enabled deployment is Ready. Authenticated `/api/handle` and same-domain quote bursts returned `429 rate_limited` without 5xx, and direct Redis PING/EVAL checks pass; checkout/user/IP/domain matrix remains outstanding. Existing `promptpay-staging-redis` was left untouched. |
| Vercel project rename `internet-price-tag` → `priced` | Implemented | Existing project renamed through the authenticated Vercel CLI; project id preserved and production alias remains `https://internet-price-tag.vercel.app` |
| Env separation (Local/Preview/Production) | Implemented | Matrix in `.env.example`; Supabase and Dodo Test Mode credentials are configured only in Vercel Production, while ordinary previews remain secret-free/demo-only. |
| Monitoring/alerts (error-event list, uptime, 5xx rate) | Implemented (docs + structured logs); External provider blocked for Vercel Log Drains | DEPLOY.md §8: exact log-drain queries + uptime endpoints. Vercel Hobby shows `Add Drain` disabled; no paid upgrade or external monitoring service was authorized. |
| Health endpoint (liveness + `?check=db` readiness) | CI verified | `tests/integration/health-analytics.test.ts` + CI smoke step |

## Holder value layer

| Item | Status | Evidence |
|---|---|---|
| Profiles: bio, CTA, held/previously-held, takeover history, stats | CI verified | `tests/integration/profile.test.ts`, `tests/browser/profile.spec.ts` |
| CTA safety (https-only, protocol rejection, noopener noreferrer nofollow, non-ownership framing) | CI verified | `tests/integration/cta.test.ts` incl. dangerous-protocol regression; WHATWG normalization safe (stores canonical URL) |
| Holder analytics `/u/[handle]/analytics` (owner-only) | Staging verified | Hosted analytics show real tag views, profile views, and share visits through the `holder_analytics` RPC; owner-only route and empty states remain CI-tested |
| Per-tab session ids for unique-visitor counts | Implemented; Locally verified | `src/lib/analytics.ts` sessionStorage id now sent by `track()`; PG-tested distinct-session counting in `holder_analytics` RPC |

## Safety & security

| Item | Status | Evidence |
|---|---|---|
| Reserved domains (static + DB), enforced at quote + inside RPC | CI verified | `tests/pg/finalize-rpc.test.ts` (reserved-domain rollback) |
| Suspension, self-takeover, IDN/punycode, IP/localhost rejection | CI verified | `src/lib/domains.test.ts`, `game.test.ts`, PG suite |
| Rate limits (quote/checkout/handle/demo-sign, user+IP+domain layers) | CI verified | `tests/integration/ratelimit.test.ts` |
| Turnstile (fail-closed when configured) | CI verified | `src/lib/turnstile.test.ts` |
| Open-redirect guards (callback, welcome, handle) | Locally verified (code review + sanitization) | `src/app/auth/callback/route.ts:11`, `welcome/page.tsx`; no automated test (P2 candidate) |
| JSON-only CSRF guards on all money/identity routes | CI verified | health-analytics tests assert 415; routes enumerated in security review |
| Security headers (HSTS, nosniff, DENY, referrer, permissions) | CI verified | `next.config.mjs`; deployed-header check is staging |
| Priced Credits OFF (no read/write path, no UI) | Verified by absence | `grep credit_ledger src/` → no request path; flag unset everywhere |
| Analytics privacy (PII strip, no raw webhook bodies, retention doc) | CI verified + documented | route tests; DEPLOY.md §9 retention |

## Trust

| Item | Status |
|---|---|
| Terms/Privacy/Refunds copy (plain-language, non-ownership distinction) | Implemented; professional review Owner blocked (DEPLOY.md Lane D1) |
| Dodo product-classification confirmation | Implemented (owner-confirmed; see `AGENTS.md` and `INTEGRATION_NOW.md`) |

## Documentation

| Item | Status |
|---|---|
| PROJECT_BLUEPRINT reflects reality (current state, not plan) | Implemented (this pass) |
| DEPLOY runbooks (incl. Vercel rename, alerts, retention) | Implemented |
| BACKLOG aligned with this file | Implemented |
| `.env.example` full audit + environment matrix | Implemented |
| No `[ ]` items describing existing features | Implemented |

## Owner gates remaining (in order — exact actions in DEPLOY.md)

1. **Supabase/Auth** (§1): complete the pre-money logical backup test; Google OAuth, callback, welcome, logout/re-login, `@harshit` handle creation, and the live two-session Realtime update are complete.
2. **Upstash** (§3/A4): verify distributed quote, checkout, handle, user, IP, and domain rate limits against the Redis-enabled Production deployment. Credential wiring, the handle burst, and a same-domain quote burst are complete; checkout/user/IP/domain coverage remains.
3. **Sandbox gate** (§4/B1): complete the remaining Dodo Test Mode matrix, run `npm run test:postgres` against real Supabase, run the hosted 10/25 challenger races, and retain the passing `npm run smoke:staging` result.
4. **Monitoring** (§8/A8): add an authorized external uptime check and decide how to handle log drains; Vercel Hobby currently has `Add Drain` disabled, so Log Drain wiring is **External provider blocked** without a plan change or external service.
5. **Backup test**: create and test the documented logical backup procedure before accepting real customer money; this is currently Owner blocked by authenticated database access. Do not enable PITR during the free beta phase.
6. **Legal review** of policy pages (D1).
7. **Live keys** (D2): swap to live Dodo config in Production only after every sandbox gate is green and plan compliance is reviewed.
8. **Closed beta** (D3): 10–20 people; watch `takeover_succeeded`, `refund_failed`, and share visits; measure repeat-challenge rate (§35 metrics list).
9. **Public launch** only after §37 gate is fully green.

## Beta measurement plan (§35)

Track via existing `analytics_events` (all real, SQL-counted):
`domain_searched → domain_opened → takeover_clicked → quote_created → checkout_started → payment_succeeded → takeover_succeeded → share_clicked → share_visit → (challenger) takeover_clicked…`

The one number that matters: repeat takeover rate — share of takeovers whose buyer previously arrived via a `share_visit`. SQL for it exists conceptually in the funnel events; a beta dashboard query should be written when staging data exists (P2 until then).
