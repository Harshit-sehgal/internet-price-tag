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

-- ============ REFUND LEDGER (20260911_000001) ============
-- Refunds are separate from webhook delivery rows because a provider refund
-- can fail, time out after succeeding, or require manual review.
create table if not exists public.refunds (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_payment_id text not null,
  provider_event_id text not null,
  reason text not null,
  amount_cents bigint,
  status text not null default 'attempting'
    check (status in ('attempting','failed','succeeded','manual_review')),
  attempts integer not null default 0 check (attempts >= 0),
  claim_token uuid,
  lease_expires_at timestamptz,
  last_attempt_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (provider, provider_payment_id)
);

create index if not exists refunds_status_updated_idx
  on public.refunds(status, updated_at desc);
create index if not exists refunds_payment_idx
  on public.refunds(provider, provider_payment_id);

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
alter table public.refunds enable row level security;
alter table public.reserved_domains enable row level security;

revoke all on table public.refunds from anon, authenticated;
grant all on table public.refunds to service_role;

-- Claim one provider refund attempt at a time. If a worker lease expires,
-- stop automatic retries and require reconciliation because the provider may
-- have accepted the refund before the worker lost its response.
create or replace function public.claim_refund_attempt(
  p_provider text,
  p_provider_payment_id text,
  p_provider_event_id text,
  p_reason text,
  p_amount_cents bigint default null,
  p_max_attempts integer default 3,
  p_lease_seconds integer default 600
)
returns table(claimed boolean, status text, attempts integer, claim_token uuid, last_error text)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  r public.refunds%rowtype;
  now_ts timestamptz := clock_timestamp();
  next_token uuid := gen_random_uuid();
  max_attempts integer := greatest(1, p_max_attempts);
  lease_seconds integer := greatest(1, p_lease_seconds);
  inserted_count integer := 0;
begin
  if nullif(trim(p_provider), '') is null
     or nullif(trim(p_provider_payment_id), '') is null
     or nullif(trim(p_provider_event_id), '') is null
     or nullif(trim(p_reason), '') is null then
    raise exception 'refund claim requires provider, payment, event and reason';
  end if;

  insert into public.refunds (
    provider, provider_payment_id, provider_event_id, reason, amount_cents,
    status, attempts, claim_token, lease_expires_at, last_attempt_at, updated_at
  ) values (
    p_provider, p_provider_payment_id, p_provider_event_id, p_reason, p_amount_cents,
    'attempting', 1, next_token,
    now_ts + make_interval(secs => lease_seconds::double precision), now_ts, now_ts
  ) on conflict (provider, provider_payment_id) do nothing;
  get diagnostics inserted_count = row_count;

  select * into r from public.refunds
  where provider = p_provider and provider_payment_id = p_provider_payment_id
  for update;

  if inserted_count = 1 then
    return query select true, 'attempting'::text, 1, next_token, null::text;
    return;
  end if;
  if r.status in ('succeeded', 'manual_review') then
    return query select false, r.status, r.attempts, r.claim_token, r.last_error;
    return;
  end if;
  if r.status = 'attempting' then
    if r.claim_token is not null and r.lease_expires_at is not null and r.lease_expires_at > now_ts then
      return query select false, r.status, r.attempts, r.claim_token, r.last_error;
      return;
    end if;
    update public.refunds set status = 'manual_review', claim_token = null,
      lease_expires_at = null, last_error = coalesce(last_error, 'refund attempt lease expired'), updated_at = now_ts
      where id = r.id;
    return query select false, 'manual_review'::text, r.attempts, null::uuid,
      coalesce(r.last_error, 'refund attempt lease expired');
    return;
  end if;
  if r.attempts >= max_attempts then
    update public.refunds set status = 'manual_review', claim_token = null,
      lease_expires_at = null, updated_at = now_ts where id = r.id;
    return query select false, 'manual_review'::text, r.attempts, null::uuid, r.last_error;
    return;
  end if;
  update public.refunds set status = 'attempting', attempts = r.attempts + 1,
    claim_token = next_token,
    lease_expires_at = now_ts + make_interval(secs => lease_seconds::double precision),
    last_attempt_at = now_ts, updated_at = now_ts
    where id = r.id returning * into r;
  return query select true, r.status, r.attempts, r.claim_token, r.last_error;
end;
$$;

revoke all on function public.claim_refund_attempt(text, text, text, text, bigint, integer, integer) from public;
revoke all on function public.claim_refund_attempt(text, text, text, text, bigint, integer, integer) from anon, authenticated;
grant execute on function public.claim_refund_attempt(text, text, text, text, bigint, integer, integer) to service_role;

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
