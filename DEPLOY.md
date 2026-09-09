# Go-Live Runbook

Everything code-side is implemented and tested. This is the short, ordered
path from this repository to accepting real money. Steps are owner-gated
because they need accounts, credentials and a legal review.

## 0. Prerequisites

- This repo with `main` green on CI.
- A domain for the app itself (e.g. `internetpricetag.com`).

## 1. Supabase (data + auth + realtime)

1. Create a project at [supabase.com](https://supabase.com) (choose a region close to expected traffic).
2. In **SQL Editor**, run `db/schema.sql` then `db/schema-extended.sql` in order.
   - This creates tables, the `finalize_takeover` RPC (service-role only), RLS, and adds `domains`/`sales` to the `supabase_realtime` publication.
3. **Authentication → Providers**: enable **Google** (needs an OAuth client from Google Cloud Console with redirect `https://<project-ref>.supabase.co/auth/v1/callback`) and **Email magic link** (disable confirm-signup captchas if you don't need them).
4. **Authentication → URL Configuration**: set Site URL to your app origin and add `<origin>/auth/callback` to redirect URLs.
5. Copy from **Project Settings → API**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (server secret — never expose to the browser)

## 2. Dodo Payments (launch provider)

1. Verify your business/account can go live for this product type. Confirm the
   symbolic-status product is permitted under Dodo's restricted businesses
   list and local law (plan §21). If anything is unclear, get written
   confirmation or consult a lawyer before proceeding.
2. Create a **one-time product with Pay-What-You-Want enabled** (min $5.00,
   no low max — each quote passes its exact next price as the cart `amount`).
   Copy its product id → `DODO_PAYMENTS_PRODUCT_ID`.
3. Copy from the Dodo dashboard:
   - `DODO_PAYMENTS_API_KEY` (test key first, live key later — never mix)
   - `DODO_PAYMENTS_MODE=test` (preview) / `live` (production)
   - Webhook secret: add an endpoint `https://<your-domain>/api/webhooks/payments`
     subscribed to `payment.succeeded`, `payment.failed`, `payment.cancelled`,
     then copy `DODO_PAYMENTS_WEBHOOK_KEY`.
4. Use test credentials first; run the §76 sandbox gate (below) before switching live.
5. Stripe remains only as an optional adapter (`STRIPE_*` keys) for experiments —
   when both are set, Dodo wins.

## 3. Vercel (hosting)

1. Import the repo into Vercel; framework auto-detects Next.js.
2. Add the custom domain and update Supabase redirect URLs to match.
3. Set environment variables for **Production** and separately for
   **Preview** (§58 — never share production DB/webhooks with previews):
   ```
   NEXT_PUBLIC_APP_URL=https://<your-domain>
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...        # Production only
   STRIPE_SECRET_KEY=...                # Production only
   STRIPE_WEBHOOK_SECRET=...            # Production only
   DEMO_WEBHOOK_SECRET=...              # Preview only, random string
   ```
4. Deploy `main`. The preview environment runs in demo mode by default.

## 4. Sandbox payment gate (§76)

On a preview deployment with Dodo **test** credentials, run and record results for:
successful payment, failed payment, cancelled checkout, duplicate webhook
delivery (replay the same event), stale quote (take the domain from another
session before paying), simultaneous checkout from two sessions, refund of a
stale payment. **No unexplained payment states are permitted.**

## 5. Content + safety pass

- Read `terms`, `privacy`, `refunds` pages and have them reviewed by a
  professional (plan §49). Edit freely — they are plain text pages.
- Add any sensitive domains you want blocked to the `reserved_domains` table
  (see `db/ops.sql` for operator queries).

## 6. Flip to live

- Switch Dodo to live mode keys, update the webhook endpoint secret.
- Watch the Vercel logs for the structured events from §56
  (`takeover_succeeded`, `payment_succeeded_takeover_stale`, `refund_failed`,
  `takeover_finalization_error`) and wire alerts to the error-level ones.
- Start with the closed beta (§77) before announcing publicly.

## Operational notes

- Suspended users are blocked at quote creation and at finalization
  (`ACCOUNT_SUSPENDED`). Suspend via the SQL in `db/ops.sql`.
- Refunds of stale payments are automatic. Refunds of completed takeovers are
  not granted (see the refunds policy page) except as required by law.
- The old placeholder UI is fully replaced; do not resurrect it.
