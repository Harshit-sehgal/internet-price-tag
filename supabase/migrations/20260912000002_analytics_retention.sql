-- Migration 20260912_000002 — analytics_events retention
--
-- WHY: public.analytics_events had no retention policy and grew forever. Each
-- row carries four indexes (event/domain/session/user) and costs roughly 2 KB
-- of storage in practice, so an unbounded funnel sink is a storage-exhaustion
-- path on the Supabase Free plan's 500 MB database. Route-level rate limits
-- (see src/lib/view-events.ts) bound the write RATE; this migration bounds the
-- TOTAL. Funnel analysis and holder analytics only ever look at a recent
-- window, so old rows are dead weight, not history: the money ledger lives in
-- public.sales, which is append-only and never touched here.
--
-- NO PAID FEATURES: pg_cron/pg_net are not assumed to exist (the Free plan may
-- not expose them and enabling extensions is an owner decision), so this
-- migration ships a callable function plus scheduling instructions instead of
-- installing a scheduler. Nothing runs automatically until someone schedules
-- it. Every statement is idempotent and safe to re-apply.

-- Default window. 180 days keeps a full funnel season (and every
-- holder-analytics range the product exposes) while capping the table's
-- steady-state size. Change the argument at call time, not this default,
-- if a different window is wanted for a one-off cleanup.
create or replace function public.prune_analytics_events(
  retain_interval interval default interval '180 days',
  max_rows integer default 50000
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  deleted_count integer := 0;
begin
  -- Bounded delete: a single unbounded DELETE on a large table can hold locks
  -- and bloat WAL far longer than a Supabase Free instance is happy with, so
  -- each call removes at most max_rows and is safe to run repeatedly until it
  -- returns 0.
  with doomed as (
    select id
    from public.analytics_events
    where created_at < now() - retain_interval
    order by created_at
    limit max_rows
  )
  delete from public.analytics_events e
  using doomed d
  where e.id = d.id;

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

comment on function public.prune_analytics_events(interval, integer) is
  'Deletes analytics_events rows older than retain_interval, at most max_rows per call. Returns the number of rows deleted. Service-role only; safe to call repeatedly until it returns 0.';

-- Least privilege: the pruner must never be reachable by anon/authenticated
-- clients. Mirrors the hardening applied to finalize_takeover/holder_analytics.
revoke all on function public.prune_analytics_events(interval, integer) from public;

do $$
begin
  begin
    revoke all on function public.prune_analytics_events(interval, integer) from anon, authenticated;
  exception when undefined_object then null;
  end;
  begin
    grant execute on function public.prune_analytics_events(interval, integer) to service_role;
  exception when undefined_object then null;
  end;
end $$;

-- Supports the retention scan itself (the funnel indexes are all prefixed by
-- another column, so none of them can drive an "old rows first" delete).
create index if not exists analytics_events_created_at_idx
  on public.analytics_events (created_at);

-- ---------------------------------------------------------------------------
-- HOW TO SCHEDULE (no paid feature required — pick one)
--
-- 1. Manual / ad hoc, from the Supabase SQL editor or a service-role psql:
--
--      select public.prune_analytics_events();                     -- 180 days
--      select public.prune_analytics_events(interval '90 days');   -- tighter
--
--    Repeat until it returns 0 to drain a large backlog in safe batches.
--
-- 2. Free scheduled job (current recommendation): call it from the existing
--    GitHub Actions cron (.github/workflows/staging-health.yml runs every 15
--    minutes on free minutes). A weekly step using the service-role key:
--
--      curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/prune_analytics_events" \
--        -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
--        -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
--        -H "Content-Type: application/json" -d '{}'
--
--    The key must come from repository secrets and must never be echoed.
--
-- 3. If, and only if, the owner later enables pg_cron on this project (an
--    extension toggle, not a plan upgrade), the equivalent schedule is:
--
--      select cron.schedule('prune-analytics-events', '17 3 * * 0',
--                           $$select public.prune_analytics_events()$$);
--
--    This migration intentionally does NOT create that extension or job.
-- ---------------------------------------------------------------------------
