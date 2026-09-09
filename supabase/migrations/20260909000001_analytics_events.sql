-- Migration 20260909_000001 — persistent analytics sink
-- Replaces console-only analytics with a queryable ledger so the funnel
-- (search → domain_opened → takeover_clicked → quote_created → checkout_started
-- → payment_succeeded/takeover_succeeded → share_clicked/copied → share_visit)
-- is genuinely measurable in production. In demo mode the sink is a best-effort
-- insert with no RLS bypass; failures there never block checkout.
-- Properties are stored as jsonb so new dimensions can be added without DDL.

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  event text not null,
  user_id uuid null,
  session_id text null,
  handle text null,
  domain text null,
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Funnel queries: event + time + domain/session.
create index if not exists analytics_events_event_created_idx on public.analytics_events(event, created_at desc);
create index if not exists analytics_events_domain_idx on public.analytics_events(domain, created_at desc);
create index if not exists analytics_events_session_idx on public.analytics_events(session_id, created_at desc);
create index if not exists analytics_events_user_idx on public.analytics_events(user_id, created_at desc);

-- RLS: this is write-only observability. No public read or client write:
-- inserts happen through the service role from /api/analytics and the server
-- wrapper; dashboards query via the Supabase SQL editor or a service-role
-- connection. Enabling RLS without a policy means both anon and authenticated
-- are blocked, which is exactly what we want.
alter table public.analytics_events enable row level security;
-- Intentionally no policies — only the service role can read/write.

-- Grant insert/select to service_role for the API routes (service_role bypasses
-- RLS, but this grant is needed on non-Supabase Postgres where RLS defaults differ).
do $$
begin
  -- Only on Postgres where the Supabase roles exist; harmless otherwise.
  begin
    grant insert, select on public.analytics_events to service_role;
  exception when undefined_object then null;
  end;
end $$;
