-- Migration 20260912_000003 — payment dispute / chargeback ledger
--
-- Before this table, Priced had no dispute state at all: the Dodo endpoint was
-- filtered to payment.succeeded / payment.failed / payment.cancelled and
-- refund events, so a
-- buyer could win a tag, charge back the payment, and keep both the tag and the
-- money with nothing recorded anywhere.
--
-- This ledger records and alerts. It deliberately does NOT reverse a takeover:
-- unwinding a holder change is an owner business decision that has not been
-- made, and an automatic reversal driven by a provider webhook would be an
-- irreversible money/provenance action taken without authorization.
--
-- DEPLOY: this table is inert until the Dodo webhook endpoint is re-filtered to
-- include `refund.succeeded`, `refund.failed`, and the `dispute.*` events
-- (dispute.opened, dispute.challenged,
-- dispute.accepted, dispute.cancelled, dispute.expired, dispute.won,
-- dispute.lost). Stripe, if used as the optional adapter, needs the
-- `charge.dispute.*` events subscribed for the same reason.

create table if not exists public.payment_disputes (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  -- The webhook delivery that produced this row. Unique so a provider retry of
  -- the same event converges (upsert) instead of appending duplicates, which
  -- keeps the webhook handler's retry contract idempotent.
  provider_event_id text not null,
  -- The disputed payment. This is the join key back to payment_events and
  -- sales.provider_payment_id, which is what makes a chargeback queryable
  -- against the takeover it funded.
  provider_payment_id text not null,
  provider_dispute_id text,
  event_type text not null,
  -- Provider-reported lifecycle fields, stored verbatim as text: Dodo's
  -- dispute_stage/dispute_status vocabulary is provider-owned and may grow, so
  -- a check constraint here would reject new states and turn an alertable
  -- chargeback into a failed webhook delivery.
  stage text,
  status text,
  -- Integer minor units, matching the rest of the money model. Nullable because
  -- dispute payloads do not always carry a comparable amount; this column is
  -- for reconciliation only and never funds or reverses anything.
  amount_cents bigint,
  currency text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

-- Operator queries: "every dispute against this payment" and "open disputes,
-- newest first".
create index if not exists payment_disputes_payment_idx
  on public.payment_disputes(provider, provider_payment_id, created_at desc);
create index if not exists payment_disputes_status_idx
  on public.payment_disputes(status, created_at desc);
create index if not exists payment_disputes_dispute_idx
  on public.payment_disputes(provider, provider_dispute_id);

-- RLS: service_role only, matching public.analytics_events and public.refunds.
-- Enabling RLS with no policy blocks both anon and authenticated, which is
-- exactly what we want — dispute records are money-sensitive operator data and
-- must never be readable by a buyer or by browser code.
alter table public.payment_disputes enable row level security;
-- Intentionally no policies.

do $$
begin
  -- Only on Postgres where the Supabase roles exist; harmless otherwise.
  begin
    revoke all on table public.payment_disputes from anon, authenticated;
  exception when undefined_object then null;
  end;
  begin
    grant select, insert, update on table public.payment_disputes to service_role;
  exception when undefined_object then null;
  end;
end $$;
