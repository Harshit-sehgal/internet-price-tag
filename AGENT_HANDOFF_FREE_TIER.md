# Priced Free Tier Agent Handoff

This file is the current handoff state for infrastructure and staging work. It overrides older assumptions in DEPLOY.md, BACKLOG.md, and LAUNCH_CHECKLIST.md wherever those documents still describe Supabase creation, a second Supabase staging project, managed backups, PITR, or paid monitoring as unfinished launch requirements.

## 1. Locked objective

The immediate objective is a working sandbox and closed beta environment with zero infrastructure subscription cost wherever possible.

Do not upgrade Supabase, Vercel, Upstash, Sentry, or another provider without the owner explicitly choosing to pay later.

Do not enable live Dodo payments until sandbox verification and legal or product classification review are complete.

Priced Credits remain off.

The market pricing rule remains unchanged:

`increment = max($5, 1% of current price)`

`next price = current price + increment`

## 2. Supabase is already created

Do not create another Priced Supabase project.

Current project:

Name: `Priced`

Project ref: `vctlhslzmplawvktnbgb`

Region: `ap-south-1`

Project URL: `https://vctlhslzmplawvktnbgb.supabase.co`

Plan target: Free

All canonical repository migrations through hosted Supabase hardening have been applied to the hosted project.

Realtime is enabled for `public.domains` and `public.sales`.

Hosted security verification confirmed that `finalize_takeover` and `holder_analytics` are not executable by `anon` or `authenticated`, while `service_role` retains execution permission.

The quote owner RLS policy has been optimized to use `(select auth.uid())`.

The remaining Supabase work is Auth configuration, application environment wiring, hosted integration testing, and free tier backup planning.

## 3. Free tier environment strategy

Do not create a second Priced Supabase project just for Preview while the owner is staying on the free plan.

The current Priced project should be treated as the real sandbox and closed beta database first.

During this phase, a designated Vercel staging or beta deployment may use the Priced Supabase project with Dodo test credentials only.

Ordinary pull request previews should remain in demo mode and should not receive the Supabase service role key or Dodo credentials.

When the project is later promoted to real money production, move the Priced Supabase credentials to Production scope only and remove them from ordinary Preview scope. A separate staging database can be introduced later if the owner chooses to free another project slot or upgrade.

Do not mix Dodo live credentials into the sandbox or closed beta environment.

## 4. Free tier backup constraint

Do not enable PITR while the owner requires a free setup.

Do not assume managed daily backup restore is available on the Free plan.

Before real money production, create and test a logical backup procedure using Supabase CLI `db dump` or `pg_dump`, with the backup stored securely outside the public repository.

Never commit database dumps, service role keys, database passwords, OAuth client secrets, Dodo keys, webhook secrets, or Upstash tokens to GitHub.

For sandbox testing, the lack of managed PITR is acceptable. For real money production, disaster recovery must be explicitly reviewed again before launch.

## 5. Supabase Auth remaining work

Enable Email magic link authentication if it is not already enabled.

Create and configure a Google OAuth client.

The Google OAuth callback for Supabase is:

`https://vctlhslzmplawvktnbgb.supabase.co/auth/v1/callback`

Set Supabase Site URL and allowed redirect URLs to the actual stable Vercel staging or beta origin once that origin is known.

Verify sign in, OAuth callback, welcome flow, handle creation, sign out, and sign in again.

Do not expose `SUPABASE_SERVICE_ROLE_KEY` to browser code or any `NEXT_PUBLIC_*` variable.

## 6. Vercel remaining work

Use the existing project currently associated with the old name `internet-price-tag` if it is still present.

Rename it to `priced` rather than creating a duplicate unless the existing project is genuinely inaccessible or broken.

Repository must be `Harshit-sehgal/priced`.

Use `main` as the production branch.

For the free sandbox phase, establish one stable staging or beta deployment URL first. A purchased custom domain is not required before sandbox testing.

Do not block testing on buying a domain.

Use the stable Vercel URL for Supabase Site URL, auth redirect allowlisting, and the Dodo test webhook endpoint until a final custom domain is chosen.

## 7. Dodo Payments remaining work

Use Test Mode only.

Create one Single Payment product with Pay What You Want enabled and a minimum price of $5.

Confirm the product description accurately states that the purchase is temporary symbolic holder status inside Priced and does not transfer the real domain, DNS, trademark, company, IP, equity, or legal ownership.

Create test API credentials and a test webhook endpoint at:

`https://<stable-staging-origin>/api/webhooks/payments`

Subscribe to the payment event types used by the current implementation and verify the current Dodo documentation before changing code.

Run real test transactions and signed webhook delivery in Test Mode. Do not substitute unsigned mock webhook generation for the final signature verification test.

Live Mode is deferred until identity and business verification, product classification confirmation, legal review, and sandbox verification are complete.

## 8. Upstash free strategy

Use a Free Upstash Redis database only.

For the sandbox and closed beta phase, one free Redis database is enough for the designated staging or beta deployment.

Do not put the Upstash token into ordinary untrusted pull request previews.

Once real production begins, revisit environment isolation before sharing or reusing the same Redis resource across environments.

Verify distributed rate limiting on the deployed beta environment.

## 9. Monitoring free strategy

Do not purchase Vercel Log Drains, Sentry, or another observability product merely to satisfy an old checklist item.

Use free Vercel logs and a free uptime monitor if available.

At minimum verify `/api/health` and `/api/health?check=db` and manually inspect structured error logs during sandbox testing.

The important events remain `refund_failed`, `takeover_finalization_error`, `webhook_store_failed`, `webhook_processing_failed`, `webhook_signature_invalid`, `payment_amount_mismatch`, and `payment_succeeded_takeover_stale`.

## 10. Work sequencing

Phase 1 can run partly in parallel:

1. Vercel project rename and stable staging URL.
2. Supabase Auth configuration.
3. Dodo Test Mode product and credentials.
4. Upstash Free Redis creation.

Phase 2 starts after the stable Vercel staging origin exists:

1. Wire Supabase environment variables into the designated staging or beta deployment.
2. Configure Supabase Site URL and redirect URLs.
3. Configure the Dodo signed test webhook endpoint.
4. Wire Upstash credentials.

Phase 3 is integration verification:

1. Authentication journey.
2. Hosted Supabase health and RLS checks.
3. Real Postgres concurrency tests.
4. Dodo sandbox success, failure, cancellation, duplicate, stale quote, wrong amount, simultaneous challenger, refund, and provider failure scenarios.
5. Realtime across two browser sessions.
6. Holder analytics with real sandbox events.
7. Mobile and social share verification.

Only after Phase 3 is green should the owner consider a 10 to 20 person closed beta.

## 11. Agent rules

Do not recreate completed infrastructure.

Do not mark something staging verified unless it was tested against the real hosted service.

Do not create paid resources.

Do not add a card to a provider or switch a provider to usage based billing without explicit owner action.

Do not enable Supabase PITR.

Do not enable Dodo live mode.

Do not enable Priced Credits.

Do not redesign the UI or add unrelated features.

Do not weaken RLS, RPC permissions, CSRF checks, rate limits, webhook signature verification, or redirect validation to make a test pass.

Do not commit secrets.

Keep code changes focused and use pull requests. Required GitHub CI must be green before merge.

## 12. Owner interaction policy

Agents should make reasonable reversible technical decisions themselves.

Only interrupt the owner for actions that genuinely require human authentication, 2FA, identity verification, business verification, acceptance of legal terms, purchase or billing authorization, a CAPTCHA, or a decision that would spend money.

For anything else, proceed and document the result.
