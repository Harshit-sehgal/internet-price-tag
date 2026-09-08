# The Internet Price Tag

**How much is the internet worth?**

The Internet Price Tag is a competitive internet game where people pay to become the current **symbolic holder** of familiar domain names such as `google.com`, `openai.com`, `apple.com`, a friend's site, a competitor, or their own startup.

Nobody receives the real domain, website, company, trademark, IP, equity, DNS control, or legal ownership. A purchase changes only the public Internet Price Tag and holder shown inside this product.

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

The previous UI direction has been rejected and **has been replaced**. The current app is a ledger-style "Internet Exchange" design built from scratch (off-white paper, hard rules, tabular numerals, no SaaS cards/gradients).

**Implemented (V1 core):** market homepage with search and activity feed, domain pages with price-transparency math and history, server-authoritative quotes (5-minute TTL), versioned atomic takeovers, Supabase auth with public handles, payment-provider abstraction with Stripe and a signed-demo provider, idempotent webhooks, stale-quote auto-refund path, success receipt with X share and dynamic OG images, legal pages, rate limiting, analytics wrapper, operator SQL, and a concurrency test suite.

**Not yet done before real-money launch:** configure live Supabase + Stripe credentials and apply `db/schema*.sql`, deploy, sandbox payment QA, professional legal review, and monitoring/alerting (§56).

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

- [MARKET_RULES.md](./MARKET_RULES.md) — exact market mechanics
- [db/schema.sql](./db/schema.sql) + [db/schema-extended.sql](./db/schema-extended.sql) — Postgres/Supabase market core, RLS, atomic takeover RPC
- [db/ops.sql](./db/ops.sql) — operator moderation tooling
- [src/lib/game.ts](./src/lib/game.ts) — deterministic market engine
- [src/lib/game.test.ts](./src/lib/game.test.ts) — market-rule tests
- [tests/integration/concurrency.test.ts](./tests/integration/concurrency.test.ts) — race-condition suite

## Technical direction

- Next.js (App Router) + TypeScript, Server Components by default
- Postgres / Supabase (auth, data, optional realtime)
- server-authoritative quotes and takeovers
- payment-provider abstraction; Stripe behind it (demo provider included)
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
```

The app runs with no credentials in demo mode (in-memory market + simulated payments). For production, copy `.env.example`, configure Supabase (auth + Postgres) and a Stripe account, and apply `db/schema.sql` then `db/schema-extended.sql`.

The market is a game/status product, **not an investment or domain-ownership product**. Never describe a holder as owning the underlying domain without an immediate explicit disclaimer.
