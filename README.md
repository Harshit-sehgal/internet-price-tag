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

The previous UI direction has been rejected. **The frontend is to be redesigned from scratch.** Do not use the old prototype as a visual reference and do not incrementally polish it.

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
- [db/schema.sql](./db/schema.sql) — Postgres/Supabase market core
- [src/lib/game.ts](./src/lib/game.ts) — deterministic market engine
- [src/lib/game.test.ts](./src/lib/game.test.ts) — market-rule tests

## Technical direction

- Next.js + TypeScript
- Postgres / Supabase
- server-authoritative quotes and takeovers
- Stripe or Polar for payments — final provider still open
- Vercel deployment
- realtime market updates
- dynamic Open Graph/share cards

## Foundation checks

```bash
npm run test:market
npm run typecheck
```

The market is a game/status product, **not an investment or domain-ownership product**. Never describe a holder as owning the underlying domain without an immediate explicit disclaimer.
