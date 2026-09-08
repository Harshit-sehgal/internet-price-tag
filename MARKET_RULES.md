# Internet Price Tag — market rules (V1)

## Core price rule

- An unclaimed domain costs **$5.00** to claim.
- Once claimed, the next takeover price is:

  `next price = current price + max($5.00, 1% of current price)`

- All prices are stored as **integer cents**. No floating-point money math.
- The challenger pays the **full next price**, not only the increment.
- The previous holder receives **no payout, credit, royalty, or ownership interest**.

Examples:

| Current | 1% | Required jump | Next takeover |
| ---: | ---: | ---: | ---: |
| $5.00 | $0.05 | $5.00 | $10.00 |
| $100.00 | $1.00 | $5.00 | $105.00 |
| $500.00 | $5.00 | $5.00 | $505.00 |
| $940.00 | $9.40 | $9.40 | $949.40 |
| $4,280.00 | $42.80 | $42.80 | $4,322.80 |
| $10,000.00 | $100.00 | $100.00 | $10,100.00 |

If 1% results in a fraction of a cent, round the percentage increment upward to the next cent.

## What a payment buys

A successful payment changes only the public symbolic holder shown by Internet Price Tag. It does not transfer the real domain, website, company, trademark, IP, equity, DNS control, or any right to represent the underlying entity.

## Canonical domain identity

Before lookup, input is normalized by:

1. lowercase;
2. strip `http://` or `https://`;
3. strip leading `www.`;
4. remove path, query string, fragment, and trailing dots;
5. reject malformed hostnames.

Production should additionally verify domain eligibility before a first paid claim.

## Atomic takeover algorithm

Each domain row has a monotonically increasing `version`.

1. Read domain row.
2. Generate quote from current `price_cents` and `version`.
3. Buyer starts checkout for exactly `quote.next_price_cents`.
4. On confirmed payment, lock the domain row in a DB transaction.
5. Re-read the row.
6. If the row version differs from quote version, the quote is stale and must not overwrite the newer holder.
7. Recompute price server-side and reject a wrong paid amount.
8. If valid, insert immutable sale history, update holder + price, and increment version.
9. Commit.
10. Generate realtime/activity/share effects from the committed sale.

Prefer payment authorization + capture after the atomic claim succeeds. If the provider charges immediately, stale paid checkouts require an automatic void/refund path.

## Leaderboard

Primary sort: current symbolic price descending.

`internet market cap` = sum of each claimed domain's current symbolic price. It is a site/game metric, not a real-world valuation.

## Production anti-manipulation

- One canonical row per normalized domain.
- Current authenticated holder cannot buy their own tag from themselves.
- Rate-limit quote/checkout creation per user + IP + domain.
- Idempotent signed payment webhook keyed by processor payment/event ID.
- Never trust success redirects.
- Store immutable sale events.
- Reserve system/sensitive domains as needed.
- Privileged finalization functions must be callable only by trusted server code.
