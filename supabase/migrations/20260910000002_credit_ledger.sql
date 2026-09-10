-- Migration 20260910_000002 — Priced Credits ledger (INACTIVE feature).
-- Table exists so a future activation needs no DDL migration, but nothing
-- reads or writes it while PRICED_CREDITS_ENABLED is off. See docs/CREDITS.md
-- for the full specification and the activation gates.

create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  domain text not null,
  sale_id uuid not null unique references public.sales(id),
  amount bigint not null check (amount > 0),
  reason text not null default 'displaced',
  created_at timestamptz not null default now()
);

create index if not exists credit_ledger_user_idx on public.credit_ledger(user_id, created_at desc);

-- Append-only scoreboard: no public access at all.
alter table public.credit_ledger enable row level security;
-- Intentionally no policies — service role only, and only when the feature
-- flag is enabled. Grant for non-Supabase Postgres role compatibility:
do $$
begin
  grant select, insert on public.credit_ledger to service_role;
exception when undefined_object then null;
end $$;
