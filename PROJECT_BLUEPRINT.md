# The Internet Price Tag — Project Blueprint

> **Status:** product foundation / pre-redesign
>
> **Design decision:** the previous UI is rejected. The frontend must be designed again from zero. Preserve the idea and market mechanics, not the old visual treatment.

---

## 1. Product in one sentence

**The Internet Price Tag is a public competitive market/game where people pay to become the temporary symbolic holder of recognizable internet domains, and anyone can take that status by paying the next required price.**

Examples include `google.com`, `openai.com`, `x.com`, `reddit.com`, `apple.com`, college domains, competitors, friends' sites, and users' own startups.

The user is never buying the actual domain. They are buying a temporary public status shown by this product.

---

## 2. Why this idea can work

The product attaches a simple competitive mechanic to objects people already recognize. We do not need to teach users why `google.com`, `openai.com`, or their friend's startup matters.

The intended viral reaction is:

> “Someone paid $1,240 just so this website says they hold google.com?”

The growth loop is:

**recognizable domain → surprising price → takeover → flex/share → reaction → challenger → higher price → stronger story.**

The absurdity is a feature. The product should be instantly explainable from a screenshot or X post.

---

## 3. Product principles

### 3.1 Understandable in seconds
A visitor should immediately understand that every domain has a current symbolic holder and a price, and someone else can take it by paying the required next price.

### 3.2 The market is the homepage
Do not build a generic SaaS landing page before the product. The live domain market itself should dominate the homepage.

### 3.3 It should feel like an internet event
Avoid a generic dashboard, AI-template landing page, glassmorphism, endless feature cards, fake testimonials, and enterprise SaaS visual language.

Possible references can come from auctions, public ledgers, scoreboards, market tapes, classified ads, internet culture, editorial design, or unexpected physical price-tag systems. These are references, not requirements.

### 3.4 Every important state should be shareable
A successful takeover should naturally create content: “@alex just took openai.com for $949.40.”

### 3.5 Language must be precise
Use `holder`, `current holder`, `claim`, `take over`, `price tag`, and `symbolic holder`. Avoid language that implies legal domain ownership, affiliation, equity, or investment rights.

---

## 4. Locked market rule

### First claim
An unclaimed eligible domain costs **$5.00**.

### Takeover

```text
increment = max($5.00, 1% of current price)
next price = current price + increment
```

The challenger pays the entire next price.

All money math uses integer cents. If 1% creates a fraction of a cent, round the percentage increment upward to the next cent.

Examples:

| Current | 1% | Required jump | Next price |
| ---: | ---: | ---: | ---: |
| $5.00 | $0.05 | $5.00 | $10.00 |
| $100.00 | $1.00 | $5.00 | $105.00 |
| $500.00 | $5.00 | $5.00 | $505.00 |
| $940.00 | $9.40 | $9.40 | $949.40 |
| $4,280.00 | $42.80 | $42.80 | $4,322.80 |
| $10,000.00 | $100.00 | $100.00 | $10,100.00 |

The current holder cannot take over their own tag.

### Former-holder economics
Recommended V1: the displaced holder receives **$0**. No resale payout, royalty, credit, equity, or investment return. This keeps the mechanic simple and avoids turning the status into a pseudo-financial asset.

---

## 5. What a payment buys

A payment buys a **revocable-by-future-takeover symbolic status on this website**.

It does not transfer:

- the registered domain;
- DNS control;
- the real website;
- the company;
- a trademark;
- copyright/IP;
- equity;
- endorsement;
- authority to impersonate the underlying entity.

This distinction must appear in product copy, checkout, receipts, share pages, terms, and marketing.

---

## 6. Core user journeys

### Homepage discovery
1. Land on the site.
2. Immediately see a live ranked market.
3. Open a recognizable domain.
4. See holder, current price, exact next price, and history.
5. Click take over.
6. Authenticate if needed.
7. Receive a server-authoritative quote.
8. Pay.
9. Payment confirmation atomically finalizes the takeover.
10. See a shareable success state.

### Search
1. Paste a domain or URL.
2. Normalize to the canonical domain.
3. If claimed, show its market page.
4. If eligible and unclaimed, show the $5 first-claim state.

### Viral deep link
A shared post should link directly to `/domain/<domain>`. The page must explain the current state and present the exact takeover CTA without requiring homepage navigation.

---

## 7. Market state

Each canonical domain has one current row:

```text
domain
holder_user_id
holder_handle
price_cents
version
claimed_at
updated_at
```

Every successful transaction creates an immutable sale/history row containing buyer, previous holder, paid amount, previous amount, resulting domain version, payment-provider ID, and timestamp.

Never reconstruct history solely from the current domain row and never rewrite old sales.

---

## 8. Domain handling

Before lookup:

1. trim;
2. lowercase;
3. strip `http://` / `https://`;
4. strip leading `www.`;
5. remove path/query/fragment;
6. remove trailing dot;
7. validate hostname syntax;
8. safely canonicalize IDNs in production.

V1 should trade registered public domains, not arbitrary URLs/paths. Decide before launch whether subdomains are eligible separately.

Production needs an eligibility policy for government/military domains, education domains, private/localhost hosts, malicious/phishing destinations, internationalized domains, and domains that no longer resolve.

Do not server-fetch arbitrary user URLs without SSRF protection.

---

## 9. Quote and concurrency model

Displayed browser prices are not authority to change the market.

Every domain has a monotonically increasing `version`.

A server quote should include:

```text
canonical domain
current holder
current price
required increment
next price
expected version
expiration
```

Finalization must:

1. start a DB transaction;
2. create/materialize the domain row for first claims;
3. lock the row (`FOR UPDATE` or equivalent);
4. re-read current version and price;
5. reject a stale expected version;
6. independently recompute the required price server-side;
7. reject an incorrect paid amount;
8. reject self-takeover;
9. update holder/price/version;
10. insert immutable sale history;
11. commit;
12. publish realtime/activity/OG invalidation after commit.

This prevents two simultaneous successful checkouts from both becoming holder.

---

## 10. Payment race strategy

Preferred if the provider supports it cleanly:

1. authorize/reserve payment;
2. attempt atomic market takeover;
3. capture only after takeover succeeds;
4. cancel authorization if stale.

Fallback:

1. charge the exact quote;
2. webhook attempts atomic takeover;
3. if stale, automatically void/refund;
4. show the new price and allow another attempt.

Never silently apply stale money to a different/higher price.

Webhook requirements:

- signed verification;
- idempotency by provider event/payment ID;
- browser redirect is never proof of payment;
- market finalization is server-only;
- retries are safe;
- payment metadata must match expected domain, buyer, quote and amount;
- `SECURITY DEFINER` DB functions must not be executable directly by normal clients.

---

## 11. Identity

V1 needs an authenticated user ID and a public display handle. A buyer must be logged in before real payment.

X identity can later be connected/verified because X sharing is likely the primary viral channel, but it should not block the first functional market unless required for anti-impersonation policy.

Handles are public identity labels inside this game; they must not permit unsafe links or impersonation claims.

---

## 12. Product surfaces

### Homepage / market
Must prioritize real market content:

- product name / concise premise;
- search/claim input;
- ranked domains;
- current holder;
- current price;
- exact next takeover price or clear CTA;
- recent takeovers;
- optional fictional “internet market cap” metric, clearly framed as a site metric.

### Domain page
Should include:

- canonical domain;
- symbolic-status disclaimer;
- current holder;
- current price;
- next required price;
- transparent explanation of the `$5 vs 1%` rule;
- takeover CTA;
- chronological/history data;
- recent holder changes;
- share action.

### Checkout
Keep it extremely short. Show domain, current state, exact charge, what the user receives, stale-quote behavior, and the non-ownership disclaimer.

### Success
Turn the transaction into a shareable receipt:

- “you now hold <domain>'s Internet Price Tag”;
- paid amount;
- previous holder when useful;
- current next price;
- share on X;
- copy link;
- visual OG/share card.

### User profile — later
A lightweight holder page may later show currently held tags and takeover history. Do not let profile complexity delay launch.

---

## 13. UI redesign brief — from scratch

The previous interface is **not a reference**. Do not preserve its typography, colors, sections, component patterns, layout, gradients, cards, or visual motifs just for continuity.

The redesign should feel:

- immediately understandable;
- competitive;
- playful/absurd but credible enough for real money;
- internet-native;
- distinctive when screenshotted;
- dense with real market information without becoming an admin dashboard;
- excellent on mobile.

Avoid:

- generic SaaS hero + feature grid;
- excessive rounded cards;
- glass panels everywhere;
- gradient-heavy AI aesthetics;
- fake charts or stats that do not come from the market;
- huge explanatory copy before the market;
- unnecessary dashboards/settings pages;
- decorative motion that slows the core action.

Design exploration should focus on hierarchy and product behavior before colors. Prototype at least 2–3 genuinely different directions before committing to one.

Potential interaction ideas worth exploring:

- a live market tape / recent takeover strip;
- physical/digital “price tag” behavior;
- domain rows that make current vs next price instantly legible;
- takeover confirmations that feel like auction wins;
- a share receipt that becomes the main viral object;
- subtle live movement when prices/holders change.

Motion should communicate transactions and changes, not merely animate sections on scroll.

Mobile is launch-critical because shared X links will often be opened on phones.

Accessibility requirements include visible focus states, keyboard operation, semantic controls, sufficient contrast, reduced-motion support, and no color-only status communication.

---

## 14. Recommended architecture

### Frontend
- Next.js App Router + TypeScript
- Server Components by default
- Client Components only where interaction/realtime requires them
- dynamic metadata/OG for domain pages

### Database
- Postgres; Supabase is the likely initial host
- integer cents
- immutable sale ledger
- DB transaction/row lock for finalization
- indexes on current price and domain sale history

### Auth
Supabase Auth is the simplest initial fit if Supabase hosts Postgres. Start with a low-friction provider such as Google/email; keep public handle separate from auth email.

### Payments
Choose Stripe vs Polar based on availability for the operating entity, payment methods, authorization/capture support, webhooks, refunds, disputes, taxes/compliance, geographic coverage, and checkout UX. Do not choose solely because integration is shorter.

### Hosting
Vercel.

### Realtime
Supabase Realtime or equivalent for holder/price changes, recent transactions, and leaderboard refresh. Realtime must never be used as transaction authority.

---

## 15. Server boundaries

Recommended conceptual endpoints/actions:

```text
GET  market leaderboard / recent activity
GET  domain state + history
POST create quote(domain)
POST create checkout(quote_id)
POST payment provider webhook
GET  dynamic OG/share image
```

Only trusted server code can finalize a paid takeover.

---

## 16. Leaderboards and metrics

Primary leaderboard: current symbolic price descending. Tie-break with deterministic time/version rules.

Useful later lists:

- biggest price tags;
- most fought-over domains;
- most takeovers today;
- fastest-rising domains;
- newest first claims;
- recent transactions.

`internet market cap` = sum of current symbolic prices of claimed domains. It must always be described as a fictional/in-product metric, never a real valuation of the internet.

---

## 17. Share system

Sharing is a core feature, not polish.

Default post format should be extremely simple and editable, e.g.:

```text
I just took openai.com for $949.40 on The Internet Price Tag.

(not the actual domain lol)
```

Dynamic OG card should prioritize domain, amount, holder, takeover state, brand, and an immediate disclaimer where needed. The visual should still work when seen without surrounding explanation.

---

## 18. Search/discovery

Search must accept pasted URLs and canonicalize them. It should make claimed/unclaimed status obvious and should support exact domain lookup first.

Do not prematurely build sophisticated fuzzy discovery. Real market activity will reveal which discovery filters are actually useful.

---

## 19. Abuse, fraud, moderation

Before public real-money launch:

- rate-limit quote creation;
- rate-limit checkout creation;
- rate-limit by account/IP/domain where appropriate;
- prevent self-takeovers;
- verify signed webhooks;
- make payment processing idempotent;
- log security-sensitive state transitions;
- create a reserved-domain/blocklist mechanism;
- create user suspension/moderation capability;
- block malicious profile metadata/links;
- use payment-provider risk/fraud controls;
- document takedown and dispute handling.

Potentially reserve the product's own domains and sensitive domains where representation creates phishing, legal, or safety risks.

---

## 20. Legal/product language

Before accepting real money, obtain appropriate legal review for the operating jurisdiction and target markets.

Need at least:

- terms of service;
- privacy policy;
- refund/stale-checkout policy;
- domain/trademark non-affiliation language;
- clear payment description;
- moderation/takedown process.

Never imply affiliation with Google, OpenAI, Apple, X, Reddit, universities, governments, or any underlying domain owner.

---

## 21. Analytics

Instrument the viral and payment loop from day one:

```text
homepage_viewed
domain_searched
domain_opened
quote_created
checkout_started
payment_succeeded
payment_failed
payment_refunded
takeover_succeeded
share_clicked
share_copied
incoming_share_visit
```

Measure search → quote, quote → checkout, checkout → paid takeover, takeover → share, share → inbound visit, and inbound visit → challenger conversion.

---

## 22. Testing

### Unit
- normalization;
- invalid domains;
- unclaimed $5 price;
- $5 increment region;
- exact $500 crossover;
- 1% increment region;
- fractional-cent ceiling;
- self-takeover rejection;
- stale quote rejection;
- wrong-price rejection;
- market-value calculation.

### Database
- simultaneous first claims;
- simultaneous takeovers;
- stale version cannot overwrite latest holder;
- duplicate webhook idempotency;
- idempotency conflict rejection;
- security permissions for finalizer.

### Integration
- quote → checkout → webhook → new holder;
- stale payment → void/refund;
- failed payment changes nothing;
- duplicate webhook changes nothing twice.

### Browser
- homepage market;
- search;
- domain page;
- checkout handoff;
- success/share flow;
- mobile layouts;
- accessibility basics.

---

## 23. Build order

### Phase 0 — foundation — current
- [x] product thesis
- [x] locked pricing formula
- [x] integer-cent math
- [x] normalization prototype
- [x] versioned market model
- [x] stale-quote protection
- [x] atomic Postgres takeover function
- [x] immutable sale history model
- [x] initial tests
- [x] previous UI rejected

### Phase 1 — redesign + shared read-only market
- [ ] create a new visual system from scratch
- [ ] produce multiple distinct design explorations
- [ ] select one direction only after comparing them
- [ ] build homepage market
- [ ] build domain page
- [ ] connect Supabase read model
- [ ] seed demo market data
- [ ] domain search + validation
- [ ] sales-history views
- [ ] mobile polish

### Phase 2 — auth + market transaction
- [ ] authentication
- [ ] public handles
- [ ] server quote endpoint
- [ ] quote expiration
- [ ] DB finalization integration
- [ ] realtime updates
- [ ] concurrency/database tests

### Phase 3 — payments
- [ ] select Stripe or Polar
- [ ] checkout from server quote
- [ ] signed webhook
- [ ] idempotency
- [ ] authorization/capture if supported
- [ ] stale-payment refund/void path
- [ ] receipts and failure states

### Phase 4 — virality
- [ ] dynamic OG images
- [ ] X share action
- [ ] copy link/post
- [ ] recent takeover feed
- [ ] inbound-share attribution

### Phase 5 — launch hardening
- [ ] rate limits
- [ ] moderation/reserved domains
- [ ] fraud controls
- [ ] terms/privacy/refund pages
- [ ] analytics
- [ ] performance/load testing
- [ ] observability/error alerts

### Phase 6 — only after usage proves demand
Consider profiles, watchlists, notifications, market categories, historical charts, advanced leaderboards, verified X identity, collections, or APIs only if real behavior justifies them.

---

## 24. Do NOT add to V1

Do not pre-build:

- complex dashboards;
- DMs/chat;
- teams/workspaces;
- subscriptions just because this is a web product;
- crypto/blockchain/NFTs;
- holder resale payouts;
- portfolios with financial-return language;
- sophisticated social graphs;
- auctions with arbitrary user-entered bids;
- AI features without a direct role in the market loop;
- complicated badges/levels;
- excessive notification systems;
- admin UI beyond what launch safety actually requires.

The core market should remain stupidly simple.

---

## 25. Open decisions

Decide deliberately before the relevant phase:

1. Stripe vs Polar.
2. Initial auth method.
3. Whether X verification is required at launch.
4. Domain eligibility: registered-only vs resolvable-only.
5. Whether subdomains have separate tags.
6. Government/education-domain policy.
7. Refund policy beyond mandatory stale-checkout handling.
8. Whether the $5 first-claim price stays fixed after launch experiments.
9. Whether the repo remains public during development.

These should not block the UI redesign unless they directly affect visible product copy.

---

## 26. Definition of a successful MVP

Two users on different devices must be able to:

1. see the same domain state;
2. receive the same server-authoritative next price;
3. attempt a takeover with real concurrency safety;
4. pay;
5. end with exactly one valid current holder;
6. see immutable history;
7. share the result publicly;
8. have another person arrive from that share and understand how to challenge them.

If that loop works cleanly, the MVP is real. Everything else is secondary.

---

## 27. Instructions for future agents/developers

1. Read this file and `MARKET_RULES.md` before making product changes.
2. Do not change the `$5 or 1%` rule unless explicitly requested.
3. Do not reuse the rejected UI direction.
4. Do not introduce arbitrary bid amounts into the current model.
5. Never use floating-point dollars for authoritative money calculations.
6. Never trust browser-calculated prices for transaction finalization.
7. Never allow a stale checkout to overwrite a newer holder.
8. Never let client code call the privileged finalization DB function directly.
9. Never imply actual domain ownership or affiliation.
10. Keep the product surface small and the market visible immediately.
11. Add features only when they strengthen comprehension, competition, payment conversion, shareability, safety, or reliability.
12. Preserve unrelated working code and tests when implementing later phases.

---

## 28. Current repo intent

`src/lib/game.ts` is the deterministic prototype of normalization, price quotes, takeover validation, versions, and market-value calculation.

`src/lib/game.test.ts` guards the locked mechanics.

`db/schema.sql` is the first production-oriented atomic market schema. It still needs auth/RLS integration and database-level concurrency tests before launch.

`src/app/page.tsx` is intentionally a placeholder. It is **not the desired design**.

---

## 29. Final thesis

The product does not win by becoming feature-rich. It wins if it makes six things unusually strong:

**understand it → care about a domain → take it → pay → flex it → get challenged.**

Everything we build should strengthen one of those six things.
