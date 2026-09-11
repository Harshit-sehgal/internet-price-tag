-- Durable refund ledger for payments that cannot be applied to a takeover.
-- A provider refund can fail, time out after succeeding, or need operator
-- attention. This table preserves that state independently of webhook rows.

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

alter table public.refunds enable row level security;
revoke all on table public.refunds from anon, authenticated;
grant all on table public.refunds to service_role;

-- Claiming is serialized in Postgres. An expired in-flight claim is moved to
-- manual_review instead of being retried automatically: a provider timeout
-- may have succeeded, so an unbounded second refund could double-refund.
create or replace function public.claim_refund_attempt(
  p_provider text,
  p_provider_payment_id text,
  p_provider_event_id text,
  p_reason text,
  p_amount_cents bigint default null,
  p_max_attempts integer default 3,
  p_lease_seconds integer default 600
)
returns table(
  claimed boolean,
  status text,
  attempts integer,
  claim_token uuid,
  last_error text
)
language plpgsql
security definer
set search_path = public, pg_temp
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
    provider,
    provider_payment_id,
    provider_event_id,
    reason,
    amount_cents,
    status,
    attempts,
    claim_token,
    lease_expires_at,
    last_attempt_at,
    updated_at
  ) values (
    p_provider,
    p_provider_payment_id,
    p_provider_event_id,
    p_reason,
    p_amount_cents,
    'attempting',
    1,
    next_token,
    now_ts + make_interval(secs => lease_seconds::double precision),
    now_ts,
    now_ts
  ) on conflict (provider, provider_payment_id) do nothing;

  get diagnostics inserted_count = row_count;

  select * into r
  from public.refunds
  where provider = p_provider
    and provider_payment_id = p_provider_payment_id
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
    if r.claim_token is not null
       and r.lease_expires_at is not null
       and r.lease_expires_at > now_ts then
      return query select false, r.status, r.attempts, r.claim_token, r.last_error;
      return;
    end if;

    update public.refunds
    set status = 'manual_review',
        claim_token = null,
        lease_expires_at = null,
        last_error = coalesce(last_error, 'refund attempt lease expired'),
        updated_at = now_ts
    where id = r.id;
    return query select false, 'manual_review'::text, r.attempts, null::uuid,
      coalesce(r.last_error, 'refund attempt lease expired');
    return;
  end if;

  if r.attempts >= max_attempts then
    update public.refunds
    set status = 'manual_review',
        claim_token = null,
        lease_expires_at = null,
        updated_at = now_ts
    where id = r.id;
    return query select false, 'manual_review'::text, r.attempts, null::uuid, r.last_error;
    return;
  end if;

  update public.refunds
  set status = 'attempting',
      attempts = r.attempts + 1,
      claim_token = next_token,
      lease_expires_at = now_ts + make_interval(secs => lease_seconds::double precision),
      last_attempt_at = now_ts,
      updated_at = now_ts
  where id = r.id
  returning * into r;

  return query select true, r.status, r.attempts, r.claim_token, r.last_error;
end;
$$;

revoke all on function public.claim_refund_attempt(text, text, text, text, bigint, integer, integer) from public;
revoke all on function public.claim_refund_attempt(text, text, text, text, bigint, integer, integer) from anon, authenticated;
grant execute on function public.claim_refund_attempt(text, text, text, text, bigint, integer, integer) to service_role;
