-- Idempotent checkout sessions: one quote maps to at most one provider session.
-- Fresh installs get these columns from db/schema-extended.sql directly;
-- run this migration on databases created before this change.
alter table public.quotes
  add column if not exists checkout_provider text,
  add column if not exists checkout_payment_id text,
  add column if not exists checkout_url text;

-- At most one stored session per quote is enforced by first-writer-wins logic
-- in setQuoteCheckout(); no extra unique constraint needed because the column
-- lives on the quote row itself.
