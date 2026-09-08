-- Internet Price Tag — production market core (Postgres / Supabase)
-- Prices are integer cents. Auth/profile/payment-provider wiring is intentionally separate.

create extension if not exists pgcrypto;

create table if not exists public.domains (
  domain text primary key,
  holder_user_id uuid null,
  holder_handle text null,
  price_cents bigint not null default 0 check (price_cents >= 0),
  version bigint not null default 0 check (version >= 0),
  claimed_at timestamptz null,
  updated_at timestamptz not null default now()
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  domain text not null references public.domains(domain),
  buyer_user_id uuid not null,
  buyer_handle text not null,
  previous_holder_user_id uuid null,
  previous_holder_handle text null,
  price_cents bigint not null check (price_cents >= 500),
  previous_price_cents bigint not null check (previous_price_cents >= 0),
  domain_version bigint not null,
  provider_payment_id text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists sales_domain_created_idx on public.sales(domain, created_at desc);
create index if not exists domains_price_idx on public.domains(price_cents desc, claimed_at asc);

create or replace function public.finalize_takeover(
  p_domain text,
  p_buyer_user_id uuid,
  p_buyer_handle text,
  p_expected_version bigint,
  p_paid_cents bigint,
  p_provider_payment_id text
)
returns public.sales
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.domains%rowtype;
  s public.sales%rowtype;
  required_increment bigint;
  required_price bigint;
begin
  if p_domain is null or p_domain = '' then
    raise exception 'INVALID_DOMAIN';
  end if;
  if p_buyer_user_id is null or p_buyer_handle is null or p_buyer_handle = '' then
    raise exception 'INVALID_BUYER';
  end if;
  if p_provider_payment_id is null or btrim(p_provider_payment_id) = '' then
    raise exception 'INVALID_PAYMENT_ID';
  end if;

  -- Idempotency: a retried signed webhook returns the already-created sale.
  select * into s from public.sales where provider_payment_id = p_provider_payment_id;
  if found then
    if s.domain <> p_domain
       or s.buyer_user_id <> p_buyer_user_id
       or s.price_cents <> p_paid_cents then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    return s;
  end if;

  -- Blocklist check inside the transaction: a domain reserved between quote
  -- creation and finalization must still fail here.
  if exists (select 1 from public.reserved_domains where domain = p_domain) then
    raise exception 'RESERVED_DOMAIN';
  end if;

  -- Materialize the canonical row so two first-claim attempts contend on one lock.
  insert into public.domains(domain) values (p_domain)
  on conflict (domain) do nothing;

  select * into d from public.domains where domain = p_domain for update;

  if d.version <> p_expected_version then
    raise exception 'STALE_QUOTE';
  end if;
  if d.holder_user_id = p_buyer_user_id then
    raise exception 'ALREADY_HOLDER';
  end if;

  if d.price_cents = 0 or d.holder_user_id is null then
    required_price := 500;
  else
    -- 1% of current price, rounded upward to the next cent.
    required_increment := greatest(500::bigint, ceil(d.price_cents::numeric / 100)::bigint);
    required_price := d.price_cents + required_increment;
  end if;

  if p_paid_cents <> required_price then
    raise exception 'WRONG_PRICE expected %, got %', required_price, p_paid_cents;
  end if;

  update public.domains
  set holder_user_id = p_buyer_user_id,
      holder_handle = p_buyer_handle,
      price_cents = p_paid_cents,
      version = version + 1,
      claimed_at = coalesce(claimed_at, now()),
      updated_at = now()
  where domain = p_domain;

  insert into public.sales(
    domain, buyer_user_id, buyer_handle,
    previous_holder_user_id, previous_holder_handle,
    price_cents, previous_price_cents, domain_version,
    provider_payment_id
  ) values (
    p_domain, p_buyer_user_id, p_buyer_handle,
    d.holder_user_id, d.holder_handle,
    p_paid_cents, d.price_cents, d.version + 1,
    p_provider_payment_id
  ) returning * into s;

  return s;
end;
$$;

-- SECURITY DEFINER functions are executable by PUBLIC unless explicitly revoked.
revoke all on function public.finalize_takeover(text, uuid, text, bigint, bigint, text) from public;

-- Supabase-specific trusted server role. Replace if using another Postgres host.
grant execute on function public.finalize_takeover(text, uuid, text, bigint, bigint, text) to service_role;
