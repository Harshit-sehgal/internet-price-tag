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

## Recorded execution evidence (2026-09-10)

- The existing Vercel project was reused and renamed from `internet-price-tag` to `priced` without creating a duplicate.
- The stable production alias is `https://internet-price-tag.vercel.app` and is connected to the renamed `priced` Vercel project.
- Vercel Git deployment remains connected to `Harshit-sehgal/priced` with `main` as the production branch.
- The stable Production environment has `NEXT_PUBLIC_APP_URL`, the three Supabase variables, the four Dodo Test Mode variables, and the two Upstash Redis variables configured. Ordinary Preview deployments remain demo-only and do not receive privileged credentials.
- Supabase Site URL is `https://internet-price-tag.vercel.app` and the `/auth/callback` redirect is configured. Google Auth Platform branding and a Web OAuth client are configured for `Priced`; Supabase Google sign-in is enabled, and a real browser login returned through the callback to Priced's welcome/handle setup page.
- Dodo Test Mode contains the approved `Priced Takeover` Pay What You Want product with a $5 minimum and a signed webhook endpoint at `https://internet-price-tag.vercel.app/api/webhooks/payments`. No live mode or real-money configuration has been enabled.
- The Dodo webhook endpoint is enabled and filtered to `payment.succeeded`, `payment.failed`, and `payment.cancelled`, matching the current Dodo event catalog. No delivery attempts have been generated yet because the real sandbox transaction matrix is still pending authenticated handle setup.
- Production liveness and Supabase readiness checks pass: `/api/health` returns `ok: true`, and `/api/health?check=db` returns `datastore: supabase` and `db: ok`.
- A new free-tier Upstash account was checked and its designated `priced-beta-redis` database was created in N. California (`us-west-1`). The existing `promptpay-staging-redis` database in the other account was left untouched. Its REST URL and write token are configured only in Vercel Production, and a fresh Production deployment completed successfully.
- Local typecheck, lint, full tests, production build, and the real-Postgres concurrency harness are green. These results do not count as staging verification.

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
8. Verify login, OAuth callback, welcome, handle creation, logout, and repeat login. **Owner blocked** only at choosing the permanent public handle; Google login, callback, and welcome are verified.
9. Keep ordinary untrusted PR previews in demo mode without service-role or Dodo credentials. **Implemented.**

### Track B: Dodo Payments

1. Work in Test Mode first. **Implemented.**
2. Create or reuse the approved Single Payment Pay What You Want product with minimum $5. **Implemented.**
3. Configure `DODO_PAYMENTS_API_KEY`, `DODO_PAYMENTS_MODE=test`, `DODO_PAYMENTS_PRODUCT_ID`, and `DODO_PAYMENTS_WEBHOOK_KEY` in the designated beta environment only. **Implemented.**
4. Configure the signed webhook endpoint at `https://<stable-beta-origin>/api/webhooks/payments`. **Implemented.**
5. Verify event names and payload fields against current Dodo docs before changing code. **Implemented**: the current Dodo event catalog lists `payment.succeeded`, `payment.failed`, and `payment.cancelled`, and the endpoint is filtered to those three events.
6. Run real signed sandbox transactions and the full payment-state matrix. **Owner blocked** until the authenticated beta login path is available.
7. Validate stale quote refunds, wrong-amount refunds, idempotency, duplicate webhooks, retries, simultaneous challengers, provider failure, and refund failure.
8. Do not enable live mode until the complete integration gate is green.

### Track C: Upstash and operational checks

1. Create one free Upstash Redis database for the designated beta environment. **Implemented** (`priced-beta-redis`, Free Tier, `us-west-1`).
2. Configure the REST URL/token only in that environment. **Implemented** in Vercel Production; the token is stored as a Secret and the URL as a Config variable.
3. Verify quote, checkout, handle, user, IP, and domain rate limits across deployed instances. **Partially verified**: the authenticated Production `/api/handle` burst returned `429 rate_limited` after the configured limit with no 5xx; the full matrix is pending permanent handle setup.
4. Use free logs and free uptime checks initially.
5. Check `/api/health` and `/api/health?check=db`.
6. Watch structured critical events during sandbox testing.

### Track D: Integration verification

Start after Tracks A-C have usable hosted resources.

1. Run hosted Postgres/RPC tests against the real Priced Supabase project.
2. Run 10 and 25 simultaneous challenger races. Exactly one takeover may finalize for one version.
3. Run `npm run smoke:staging` against the stable beta deployment.
4. Verify Realtime across two sessions.
5. Complete the real journey: search, login, handle, quote, Dodo sandbox checkout, signed webhook, finalization, history, profile, analytics, CTA, share, share visit.
6. Verify analytics events and holder aggregation using real sandbox activity.
7. Verify security headers and direct RPC denial for anon/authenticated roles.
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
