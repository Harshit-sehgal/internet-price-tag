# Priced

[![CI](https://github.com/Harshit-sehgal/priced/actions/workflows/ci.yml/badge.svg)](https://github.com/Harshit-sehgal/priced/actions/workflows/ci.yml)

**How much is the internet worth?**

Priced is a competitive internet game where people pay to become the current **symbolic holder** of familiar domain names such as `google.com`, `openai.com`, `apple.com`, a friend's site, a competitor, or their own startup.

Nobody receives the real domain, website, company, trademark, IP, equity, DNS control, or legal ownership. A purchase changes only the public price tag and holder shown inside Priced.

## Core loop

1. Search any valid domain.
2. See its current symbolic holder and current price.
3. Take it for the required next price.
4. The successful buyer becomes the new holder.
5. Share the takeover publicly.
6. Someone else can take it later by paying the next price.

## Pricing

Unclaimed domains start at **$5**.

```text
increment = max($5, 1% of current price)
next price = current price + increment
```

The challenger pays the **full next price**, not only the increment. Money is stored as integer cents.

## Repository status

**Implemented (Priced core):** market homepage with search, activity, most
contested, fastest rising and newly claimed; domain pages with transparent
price math and permanent provenance ledger (previous holder, price delta,
first claims, totals); holder profiles with optional bio, avatar fields and a
safe external CTA shown on the profile and on held tags; owner-only holder
analytics at `/u/[handle]/analytics` (real counts from `analytics_events`,
honest empty states); server-authoritative quotes (5-minute TTL), versioned
atomic takeovers (Postgres `FOR UPDATE` RPC + in-memory mirror for demo),
Supabase SSR auth + immutable handles, reserved-domain and IDN protections,
Dodo Payments (launch default) + Stripe adapter + demo provider with
idempotent webhooks and stale-quote auto-refund, share attribution + branded
OG cards, realtime display sync, persistent analytics, versioned migrations,
structured payment logging, and CI covering lint, typecheck, unit,
integration, dockerized real-Postgres RPC races, browser (desktop + mobile +
375/430/tablet viewports), production build and a live-HTTP race test.

**Not active:** Priced Credits (spec + ledger exist, flag off, see
[docs/CREDITS.md](./docs/CREDITS.md)).

**Not yet done before real-money launch:** create the Supabase project and
apply migrations, add Dodo sandbox credentials then live keys + webhook
secret + PWYW product, configure Upstash, deploy to Vercel with split
Preview/Production envs, run the sandbox payment matrix, get legal review of
the policy pages, then wire alerts. LAUNCH_CHECKLIST.md tracks every gate.

The reusable foundation is:

- the product idea and viral loop;
- the market pricing rule;
- domain normalization;
- versioned quotes;
- stale-quote protection;
- atomic takeover semantics;
- immutable sale history;
- payment/webhook safety rules;
- product/legal language.

Read **[PROJECT_BLUEPRINT.md](./PROJECT_BLUEPRINT.md)** before changing the product.

Also see:

- [MARKET_RULES.md](./MARKET_RULES.md) · exact market mechanics
- [supabase/migrations/](./supabase/migrations/) · versioned migrations (canonical history) + [db/schema.sql](./db/schema.sql) + [db/schema-extended.sql](./db/schema-extended.sql) · portable single-apply equivalents, RLS, atomic takeover RPC
- [db/ops.sql](./db/ops.sql) · operator moderation tooling
- [src/lib/game.ts](./src/lib/game.ts) · deterministic market engine
- [src/lib/game.test.ts](./src/lib/game.test.ts) · market-rule tests
- [tests/integration/concurrency.test.ts](./tests/integration/concurrency.test.ts) · race-condition suite

## Technical direction

- Next.js (App Router) + TypeScript, Server Components by default
- Postgres / Supabase (auth, data, optional realtime)
- server-authoritative quotes and takeovers
- payment-provider abstraction; Dodo Payments behind it (Stripe adapter + demo provider included)
- Vercel deployment
- realtime market updates
- dynamic Open Graph/share cards

## Foundation checks

```bash
npm install
npm run test        # market rules + concurrency suite
npm run typecheck
npm run lint
npm run build
npx playwright install chromium
npm run test:browser # §54 browser suite (desktop + mobile, demo mode)
```

The app runs with no credentials in demo mode (in-memory market + simulated payments). For production, copy `.env.example`, configure Supabase (auth + Postgres) and a Dodo Payments account (create a Pay-What-You-Want one-time product for dynamic takeover pricing), and apply either `supabase/migrations/*` via `npx supabase db push` or `db/schema.sql` then `db/schema-extended.sql` — both paths are kept in sync.

V1 eligibility is explicit: `ALLOWED_SUFFIXES` in `src/lib/domains.ts` is the launch allowlist; IDN/punycode (`xn--`) is rejected to avoid homograph/display risk (DEPLOY.md §9).

The market is a game/status product, **not an investment or domain-ownership product**. Never describe a holder as owning the underlying domain without an immediate explicit disclaimer.
