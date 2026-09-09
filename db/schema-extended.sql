-- Internet Price Tag — identity, quotes, payment observability, moderation.
-- Run AFTER db/schema.sql on the production Supabase/Postgres database.

-- ============ PROFILES ============
-- Auth identity (auth.users) and public identity stay conceptually separate.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text not null unique,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  suspended_at timestamptz
);

create index if not exists profiles_handle_idx on public.profiles(handle);

-- ============ QUOTES ============
-- A quote is a server-calculated price pinned to a market version. It never
-- guarantees ownership, only "this price is valid while version = X".
create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  domain text not null,
  buyer_user_id uuid not null references public.profiles(id) on delete cascade,
  expected_version bigint not null,
  current_price_cents bigint not null,
  required_increment_cents bigint not null,
  next_price_cents bigint not null,
  expires_at timestamptz not null,
  status text not null default 'active'
    check (status in ('active','checkout_created','consumed','expired','stale','cancelled')),
  created_at timestamptz not null default now(),
  -- Idempotent checkout: one quote reuses one provider session on retry.
  checkout_provider text,
  checkout_payment_id text,
  checkout_url text
);

create index if not exists quotes_buyer_idx on public.quotes(buyer_user_id, created_at desc);
create index if not exists quotes_domain_status_idx on public.quotes(domain, status);

-- ============ PAYMENT EVENTS ============
-- Raw provider webhook log for idempotency and observability.
create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  provider_payment_id text not null,
  event_type text not null,
  payload_hash text,
  status text not null default 'received'
    check (status in ('received','processed','ignored','error')),
  error text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create index if not exists payment_events_payment_idx on public.payment_events(provider_payment_id, created_at desc);

-- ============ RESERVED DOMAINS ============
-- Operator-managed blocklist (db/ops.sql or SQL editor; no code path required).
create table if not exists public.reserved_domains (
  domain text primary key,
  reason text not null,
  created_by text,
  created_at timestamptz not null default now()
);

-- ============ ROW LEVEL SECURITY ============
-- Public can read market state, history and profiles. Critical writes happen
-- only through trusted server code (service role); clients can never mutate
-- prices, holders, versions, sales, quotes or payment records.

alter table public.domains enable row level security;
alter table public.sales enable row level security;
alter table public.profiles enable row level security;
alter table public.quotes enable row level security;
alter table public.payment_events enable row level security;
alter table public.reserved_domains enable row level security;

drop policy if exists "public read domains" on public.domains;
create policy "public read domains" on public.domains for select using (true);

drop policy if exists "public read sales" on public.sales;
create policy "public read sales" on public.sales for select using (true);

drop policy if exists "public read profiles" on public.profiles;
create policy "public read profiles" on public.profiles for select using (true);

drop policy if exists "owner reads own quotes" on public.quotes;
create policy "owner reads own quotes" on public.quotes for select
  using (auth.uid() = buyer_user_id);

-- profiles: read-only for clients. Writes (handles, suspension) happen only
-- through trusted server code with the service role, which bypasses RLS.
-- A permissive self-update policy would let a suspended user unsuspend
-- themselves or cycle handles, so no insert/update policies exist.

drop policy if exists "owner inserts own profile" on public.profiles;
drop policy if exists "owner updates own profile" on public.profiles;

-- payment_events: no client policies at all (service role only).
-- reserved_domains: readable by service role; evaluated server-side.

-- service_role bypasses RLS and was granted execute on finalize_takeover in
-- db/schema.sql. No anon/authenticated grants exist for it.

-- ============ REALTIME ============
-- Display synchronization only; the database remains transaction authority.
alter publication supabase_realtime add table public.domains;
alter publication supabase_realtime add table public.sales;
