-- Migration 20260912_000001 — close the finalize_takeover idempotency race.
--
-- BUG (reproduced deterministically against real postgres:16):
-- the sales idempotency lookup ran BEFORE `select ... for update` on
-- public.domains and was never repeated after the lock was acquired. Under
-- READ COMMITTED a second transaction reads `sales` while the winner is still
-- uncommitted (finds nothing), then parks on the row lock. When the winner
-- commits, the loser wakes, re-reads `domains` with the NEW version, and
-- raises STALE_QUOTE for a payment that had, in fact, already finalized.
--
--   A: begin; finalize_takeover(...) -> sale af3dca68   (held open)
--   B: begin; finalize_takeover(...) -> blocks on the row lock
--   A: commit
--   B: -> STALE_QUOTE            (sales rows for this payment id: 1)
--
-- src/lib/takeover.ts REFUNDS on STALE_QUOTE, so the buyer kept the tag AND
-- got their money back. Reachable whenever two DISTINCT webhook event ids for
-- ONE payment arrive concurrently: routine on the Stripe adapter, where
-- `checkout.session.completed` and `payment_intent.succeeded` both map to
-- "succeeded" and carry the same payment_intent; possible on Dodo via a
-- dashboard replay racing the original delivery.
--
-- FIX: re-run the idempotency lookup AFTER the lock is held. At that point the
-- winner has committed, so the duplicate delivery observes the existing sale
-- and returns it — the same answer a sequential retry already produced.
-- A check taken before a lock is not a check.
--
-- Behaviour is otherwise byte-for-byte identical to
-- 20260908000001_market_core.sql: same signature, same error codes, same
-- pricing (LOCKED: unclaimed $5; increment max($5, 1%) rounded up), same grants.

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

  -- Fast path: a retried signed webhook returns the already-created sale
  -- without taking the row lock at all.
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

  -- Re-check idempotency now that the lock is HELD. A concurrent delivery of
  -- this same payment may have committed while we were parked above; without
  -- this the version check below would raise STALE_QUOTE and the caller would
  -- refund a sale that genuinely succeeded.
  select * into s from public.sales where provider_payment_id = p_provider_payment_id;
  if found then
    if s.domain <> p_domain
       or s.buyer_user_id <> p_buyer_user_id
       or s.price_cents <> p_paid_cents then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    return s;
  end if;

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
grant execute on function public.finalize_takeover(text, uuid, text, bigint, bigint, text) to service_role;
