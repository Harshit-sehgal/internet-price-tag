-- Priced — identity, quotes, payment observability, moderation.
-- Run AFTER db/schema.sql on the production Supabase/Postgres database.

-- ============ PROFILES ============
-- Auth identity (auth.users) and public identity stay conceptually separate.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text not null unique,
  display_name text,
  avatar_url text,
  bio text check (char_length(bio) <= 280),
  cta_label text check (char_length(cta_label) <= 40),
  cta_url text check (char_length(cta_url) <= 300),
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

-- ============ HOLDER ANALYTICS RPC (20260910_000003) ============
create index if not exists analytics_events_event_handle_created_idx
  on public.analytics_events(event, handle, created_at desc);
create index if not exists sales_buyer_created_idx
  on public.sales(buyer_handle, created_at desc);
create index if not exists sales_first_claim_idx
  on public.sales(previous_price_cents, created_at desc)
  where previous_price_cents = 0;

create or replace function public.holder_analytics(p_handle text, p_since timestamptz)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'tag_views', (
      select count(*) from public.analytics_events
      where event = 'tag_viewed' and handle = p_handle and created_at >= p_since
    ),
    'tag_view_sessions', (
      select count(distinct session_id) from public.analytics_events
      where event = 'tag_viewed' and handle = p_handle and created_at >= p_since
        and session_id is not null
    ),
    'profile_views', (
      select count(*) from public.analytics_events
      where event = 'profile_viewed' and handle = p_handle and created_at >= p_since
    ),
    'share_visits', (
      select count(*) from public.analytics_events
      where event = 'share_visit' and handle = p_handle and created_at >= p_since
    ),
    'cta_clicks', (
      select count(*) from public.analytics_events
      where event = 'cta_clicked' and handle = p_handle and created_at >= p_since
    ),
    'by_domain', (
      select coalesce(jsonb_agg(x order by x.tag_views desc), '[]'::jsonb)
      from (
        select domain,
               count(*) as tag_views,
               count(distinct session_id) as unique_sessions
        from public.analytics_events
        where event = 'tag_viewed' and handle = p_handle and created_at >= p_since
          and domain is not null
        group by domain
      ) x
    ),
    'daily', (
      select coalesce(jsonb_agg(x order by x.day asc), '[]'::jsonb)
      from (
        select to_char(created_at, 'YYYY-MM-DD') as day,
               count(*) as views
        from public.analytics_events
        where event = 'tag_viewed' and handle = p_handle and created_at >= p_since
        group by 1
      ) x
    )
  );
$$;
revoke all on function public.holder_analytics(text, timestamptz) from public;
do $$
begin
  grant execute on function public.holder_analytics(text, timestamptz) to service_role;
exception when undefined_object then null;
end $$;

-- ============ PRICED CREDITS LEDGER (INACTIVE, 20260910_000002) ============
-- Table exists so a future activation needs no DDL migration. Nothing reads
-- or writes it while PRICED_CREDITS_ENABLED is off. See docs/CREDITS.md.
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

alter table public.credit_ledger enable row level security;
do $$
begin
  grant select, insert on public.credit_ledger to service_role;
exception when undefined_object then null;
end $$;
