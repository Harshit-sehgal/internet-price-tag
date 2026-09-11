# Priced Integration Execution State

This file is the current authority for the next execution phase and overrides older wording that treats Dodo product eligibility as unresolved.

## Locked state

- Product: Priced
- Repository: `Harshit-sehgal/priced`
- Dodo Payments product eligibility: confirmed by owner
- Primary payment provider: Dodo Payments
- Supabase project: already created
- Supabase project ref: `vctlhslzmplawvktnbgb`
- Supabase region: `ap-south-1`
- Supabase plan target: Free
- Supabase migrations: applied through hosted hardening
- Realtime: enabled for required market tables
- Privileged RPCs: service-role only
- Priced Credits: OFF
- Pricing formula: `increment = max($5, 1% of current price)` and `next price = current price + increment`
- Goal: complete a real free-tier sandbox/closed-beta integration before enabling real money

## Recorded execution evidence (2026-09-11)

- The existing Vercel project was reused and renamed from `internet-price-tag` to `priced` without creating a duplicate.
- The stable production alias is `https://internet-price-tag.vercel.app` and is connected to the renamed `priced` Vercel project.
- Vercel Git deployment remains connected to `Harshit-sehgal/priced` with `main` as the production branch.
- The stable Production environment has `NEXT_PUBLIC_APP_URL`, the three Supabase variables, the four Dodo Test Mode variables, and the two Upstash Redis variables configured. Ordinary Preview deployments remain demo-only and do not receive privileged credentials.
- Supabase Site URL is `https://internet-price-tag.vercel.app` and the `/auth/callback` redirect is configured. Google Auth Platform branding and a Web OAuth client are configured for `Priced`; Supabase Google sign-in is enabled, and a real browser login returned through the callback to Priced's welcome/handle setup page.
- Dodo Test Mode contains the approved `Priced Takeover` Pay What You Want product with a $5 minimum and a signed webhook endpoint at `https://internet-price-tag.vercel.app/api/webhooks/payments`. No live mode or real-money configuration has been enabled.
- The Dodo webhook endpoint was initially filtered to the three payment events during the first sandbox pass. Its current configuration includes all 12 events required by the current provider contract: `payment.succeeded`, `payment.failed`, `payment.cancelled`, `refund.succeeded`, `refund.failed`, and the seven dispute lifecycle events. Real Dodo Test Mode success and declined-card payments were exercised after authentication. A real hosted payload exposed that Dodo includes tax in `total_amount`; the integration was corrected to validate the pre-tax market amount, and the regression passed in CI. A post-fix Test Mode success then reached the hosted endpoint, finalized `realtime-success-us-20260911.com`, consumed the quote once, and returned the receipt. Replaying that same signed Dodo message produced a second HTTP 200 delivery and a hosted `webhook_duplicate_event` log without a second takeover. On 2026-09-11, Dodo's endpoint dashboard replayed an existing `payment.succeeded` message and recorded a new HTTP 200 delivery, verifying provider retry/replay handling in Test Mode. Dodo's endpoint Testing control sent synthetic `payment.failed` and `payment.cancelled` samples to the real endpoint, both recorded HTTP 200. A synthetic `payment.succeeded` sample with empty application metadata correctly entered the fail-closed refund path: because Dodo's sample payment is not refundable, the endpoint returned HTTP 500 and a replay returned HTTP 500 again, preserving provider retry semantics without creating a sale. A real Dodo Test Mode checkout created without application metadata then succeeded; its signed webhook returned HTTP 200, Dodo recorded a successful full refund of $5.90 linked to that payment, and a public sales query returned no matching payment ID. This verifies real missing-metadata refund/no-sale handling. A real customer cancellation on a fresh Test Mode checkout returned to `canceltest-mtwstrs0.com?checkout=cancelled`, left the domain unclaimed, and Dodo's endpoint log recorded `payment.cancelled` with HTTP 200. Earlier hosted stale-quote and wrong-amount cases were also refunded successfully. On 2026-09-11, a fresh ten-way hosted Dodo checkout race produced exactly one processed takeover (`@harshit`, version 1) and nine stale quotes. The nine stale webhook paths reached the hosted handler, but the Dodo Test Mode wallet could not close the full refund set: seven were later refunded successfully through the Test API and two refund attempts returned `INSUFFICIENT_WALLET_FUNDS`. The Dodo Test Mode Account Statement showed a $5.90 refund, a +$0.90 tax reversal, and a -$1.00 refund fee per completed refund, so each refund consumes approximately $6.00 of wallet balance; the failure is a provider-wallet funding limit, not a $5-versus-$5.90 application pricing mismatch. A direct full-refund attempt from Dodo's Test Mode dashboard reproduced the same `Insufficient funds in wallet` error; a subsequent dashboard retry still failed, and the Test Mode Account Statement showed only $1.49 total balance. The disposable database fixture was removed; this ten-way race is therefore **External provider blocked** for complete refund closure. The provider-outage path is **Staging verified**; only the 25-way HTTP/payment race remains outstanding.
- Production liveness and Supabase readiness checks pass: `/api/health` returns `ok: true`, and `/api/health?check=db` returns `datastore: supabase` and `db: ok`.
- A new free-tier Upstash account was checked and its designated `priced-beta-redis` database was created in N. California (`us-west-1`). The existing `promptpay-staging-redis` database in the other account was left untouched. Its REST URL and write token are configured only in Vercel Production, and a fresh Production deployment completed successfully.
- The authenticated beta user selected and saved the permanent public handle `@harshit`. The hosted domain, profile, receipt, share URL, and owner-only analytics page render successfully; real hosted analytics now show tag views, profile views, and share visits.
- The hosted staging smoke passes all 9 checks, and `/api/health` plus `/api/health?check=db` are healthy. A clean concurrent run against the deployed Production routes and real Upstash Redis verified every configured limiter without a 5xx: handle user `5/6` then `429`, handle IP `15/16` then `429`, profile user `10/11` then `429`, quote user `30/31` then `429`, quote IP `60/61` then `429`, quote domain `30/31` then `429`, quote user+domain `8/9` then `429`, checkout user `20/21` then `429`, and checkout IP `30/31` then `429`. The quote/domain requests created only disposable quotes, checkout requests used an invalid quote id, and all 20 disposable Auth users, profiles, and quotes were removed afterward. This is **Staging verified** for the complete Upstash quote/checkout/user/IP/domain matrix. A free GitHub Actions workflow now checks both hosted health endpoints every 15 minutes; Vercel Hobby log-drain/alert controls remain unavailable.
- A separate hosted observer session received the live Realtime market update after the post-fix takeover: it changed to `CURRENT HOLDER @harshit`, showed the permanent history entry, and displayed the `$10` next takeover price without a reload. This is **Staging verified** for the live two-session Realtime path.
- The Supabase Database → Backups page confirms that the current Free Plan does not include managed project backups. A real hosted logical schema-and-data dump, followed by restore into an isolated PostgreSQL 17 container, is **Staging verified** using the authenticated Supabase CLI on 2026-09-11. The restored fixture contained 3 domains, 3 sales, 2 profiles, 97 analytics events, and 5 payment events. This verifies the free-tier recovery procedure; managed backups/PITR remain unavailable and PITR is intentionally not enabled for this free beta.
- Hosted database-level concurrency is **Staging verified** using a fresh authenticated Supabase CLI database login and a bounded PostgreSQL client pool on 2026-09-11: 10 simultaneous first claims produced exactly 1 `OK` and 9 `STALE_QUOTE` results; 25 simultaneous takeovers of a held domain produced exactly 1 `OK` and 24 `STALE_QUOTE` results, with final states `version=1/price=500/sales=1` and `version=2/price=1000/sales=2`. Both disposable test domains were removed after verification. The REST/service-role harness is now also **Staging verified**: `RUN_POSTGRES_TESTS=1 npm run test:postgres` ran against the real project with the protected key held transiently in memory and all 8 tests passed; the key was never printed or stored.
- Local typecheck, lint, full tests, production build, and the real-Postgres concurrency harness are green. These results do not count as staging verification.

## Recorded execution evidence (2026-09-12)

- PR #53 (`8b86ae3`, “Harden payment and data safety paths”) is merged to `main` with required GitHub CI green. The production deployment `dpl_Eyt2sKn9gd9zsyZQ199C3ptizNs1` is Ready and serves the stable alias `https://internet-price-tag.vercel.app`.
- The four hosted hardening migrations from PR #53 were applied to the existing Priced Supabase project: finalize idempotency recheck, analytics retention, payment disputes, and profiles column privacy. A hosted security query confirmed the dispute table and retention index exist; `service_role` can execute the privileged functions while `anon` cannot; `service_role` can read disputes while `anon` cannot; and `anon` can read public profile fields but not `suspended_at`.
- The stable-origin smoke suite passes all 9 checks after the deployment. Dodo’s signed Test Mode webhook Testing control sent a `payment.failed` example to the live endpoint, and Vercel recorded HTTP 200 on the current production deployment.
- The Dodo Test Mode webhook endpoint now subscribes to all 12 required events: `payment.succeeded`, `payment.failed`, `payment.cancelled`, `refund.succeeded`, `refund.failed`, and `dispute.opened`, `dispute.challenged`, `dispute.accepted`, `dispute.cancelled`, `dispute.expired`, `dispute.won`, and `dispute.lost`.

## Do not redo

Do not recreate Supabase.
Do not re-investigate Dodo product eligibility unless Dodo asks for another review.
Do not redesign the application.
Do not change the pricing formula.
Do not enable Credits.
Do not weaken RLS, webhook verification, CSRF protections, redirect validation, rate limits, or takeover concurrency controls.
Do not create paid infrastructure without explicit owner approval.

## Parallel integration tracks

### Track A: Vercel and auth

1. Gain access to the existing Vercel project currently associated with `internet-price-tag`. **Implemented.**
2. Rename it to `priced` where possible rather than creating a duplicate. **Implemented.**
3. Ensure Git integration uses `Harshit-sehgal/priced` and `main`. **Implemented.**
4. Establish one stable beta/staging origin. **Implemented** with `https://internet-price-tag.vercel.app`.
5. Wire the Priced Supabase public URL/key and server-only service-role key into that designated environment. **Implemented.**
6. Configure Supabase Site URL and redirects using the stable origin. **Implemented.**
7. Configure Google OAuth as the primary beta login. **Implemented.**
8. Verify login, OAuth callback, welcome, handle creation, logout, and repeat login. **Staging verified** with Google OAuth and the saved public handle `@harshit`.
9. Keep ordinary untrusted PR previews in demo mode without service-role or Dodo credentials. **Implemented.**

### Track B: Dodo Payments

1. Work in Test Mode first. **Implemented.**
2. Create or reuse the approved Single Payment Pay What You Want product with minimum $5. **Implemented.**
3. Configure `DODO_PAYMENTS_API_KEY`, `DODO_PAYMENTS_MODE=test`, `DODO_PAYMENTS_PRODUCT_ID`, and `DODO_PAYMENTS_WEBHOOK_KEY` in the designated beta environment only. **Implemented.**
4. Configure the signed webhook endpoint at `https://<stable-beta-origin>/api/webhooks/payments`. **Implemented.**
5. Verify event names and payload fields against current Dodo docs before changing code. **Implemented**: the endpoint is currently subscribed to all 12 required payment, refund, and dispute events; the hosted endpoint configuration was rechecked on 2026-09-12.
6. Run real signed sandbox transactions and the full payment-state matrix. **Staging verified (partial)** for successful and declined payments, signed webhook delivery, duplicate-event replay/idempotency, provider replay of a successful event with a new HTTP 200 delivery, synthetic provider `payment.failed` and `payment.cancelled` delivery with HTTP 200, a real customer-cancellation state transition with `payment.cancelled` delivered HTTP 200, the fail-closed synthetic missing-metadata/refund-failure path with repeatable HTTP 500 retry behavior, a real missing-metadata payment with successful full refund and no matching sale, cancelled-checkout UI behavior, quote consumption, atomic takeover finalization, tax-inclusive provider payload handling, stale/wrong-amount refunds, and the provider-outage path. For the latter, a temporary invalid `DODO_PAYMENTS_BASE_URL` deployment returned hosted `502 checkout_failed` before creating a provider payment; the override was removed and normal health/smoke checks passed. The simultaneous hosted payment race remains outstanding.
7. Validate stale quote refunds, wrong-amount refunds, idempotency, duplicate webhooks, retries, simultaneous challengers, provider failure, and refund failure.
8. Do not enable live mode until the complete integration gate is green.

### Track C: Upstash and operational checks

1. Create one free Upstash Redis database for the designated beta environment. **Implemented** (`priced-beta-redis`, Free Tier, `us-west-1`).
2. Configure the REST URL/token only in that environment. **Implemented** in Vercel Production; the token is stored as a Secret and the URL as a Config variable.
3. Verify quote, checkout, handle, user, IP, and domain rate limits across deployed instances. **Staging verified**: concurrent hosted bursts hit every configured ceiling—handle user/IP `5/15`, profile user `10`, quote user/IP/domain/user+domain `30/60/30/8`, and checkout user/IP `20/30`—with the next request returning `429 rate_limited` and no 5xx. Disposable Auth users, profiles, and quotes were removed after the run.
4. Use free logs and free uptime checks initially. `.github/workflows/staging-health.yml` provides a free scheduled liveness/readiness check with GitHub Actions failure notifications. Vercel Hobby currently has no available Log Drain or alert-rule destination (`Add Drain`, `Add Rule`, and `Add Webhook` are disabled), so Vercel log-drain wiring remains **External provider blocked**.
5. Check `/api/health` and `/api/health?check=db`.
6. Watch structured critical events during sandbox testing.

### Track D: Integration verification

Start after Tracks A-C have usable hosted resources.

1. Run the hosted REST/service-role Postgres/RPC harness against the real Priced Supabase project. **Staging verified**: the protected key was held transiently in memory and `npm run test:postgres` passed all 8 real-project tests. Direct hosted database-level RPC concurrency is also **Staging verified**: the 10- and 25-request races had exactly one winner each and all other attempts returned `STALE_QUOTE`.
2. Run 10 and 25 simultaneous challenger races through the hosted HTTP/payment path. The ten-way run is **External provider blocked** for complete Dodo Test Mode refund closure: exactly one takeover finalized and nine stale payments were identified, but the sandbox wallet returned `INSUFFICIENT_WALLET_FUNDS` for two refunds after seven were completed. A direct dashboard refund reproduced the same wallet error. The provider-outage path is **Staging verified**: the temporary invalid Dodo base URL returned `502 checkout_failed` before provider payment creation, was removed, and the normal deployment was restored. The 25-way HTTP/payment race remains unrun.
3. Run `npm run smoke:staging` against the stable beta deployment. **Staging verified** (9 checks pass).
4. Verify Realtime across two sessions, including a live market update. **Staging verified** on `realtime-success-us-20260911.com`; the observer updated to `@harshit`, history, and the `$10` next price without reload.
5. Complete the real journey: search, login, handle, quote, Dodo sandbox checkout, signed webhook, finalization, history, profile, analytics, CTA, share, and share visit. **Staging verified** for the exercised success path.
6. Verify analytics events and holder aggregation using real sandbox activity. **Staging verified** with hosted tag, profile, and share events and non-empty holder analytics.
7. Verify security headers and direct RPC denial for anon/authenticated roles. **Staging verified**: the Production response includes HSTS, `nosniff`, `DENY`, strict referrer, and permissions headers; direct anonymous Supabase REST calls to `finalize_takeover` and `holder_analytics` both returned HTTP 401.
8. Verify mobile layouts at 375, 430 and 768 px and perform one real-device check where possible.

## Free-tier rule

Sandbox and closed-beta infrastructure should remain free wherever possible.

Do not enable Supabase PITR or buy monitoring solely for staging.
Do not buy a custom domain just to unblock sandbox testing.
Do not upgrade Vercel merely to complete sandbox integration.

Before accepting real customer payments, re-check production hosting plan compliance, disaster recovery, legal documents, support contact, live Dodo credentials, and environment isolation.

## Agent behavior

Make reversible technical decisions without asking the owner each time.
Only interrupt for human authentication, 2FA, KYC, CAPTCHA, acceptance of legal terms, unavailable credentials, or a step that would spend money.
Never invent a completed test or credential.
Use focused PRs and keep required GitHub CI green.

## Completion definition

This phase is complete only when a real hosted beta environment successfully exercises Supabase, Auth, Dodo Test Mode, signed webhooks, Redis rate limits, Realtime, analytics, and concurrency end to end with no unexplained payment state.
