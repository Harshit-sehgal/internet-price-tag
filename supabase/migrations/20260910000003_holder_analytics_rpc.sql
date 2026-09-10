-- Migration 20260910_000003 — holder analytics SQL aggregation (§18).
-- Moves per-domain, per-day and unique-session counting from bounded
-- application-side fetches into the database. Counts stay real: this only
-- aggregates existing analytics_events rows; it never estimates.

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

-- Support index: every holder_analytics metric filters on
-- (event, handle, created_at). None of the existing indexes cover handle.
create index if not exists analytics_events_event_handle_created_idx
  on public.analytics_events(event, handle, created_at desc);

-- Discovery/ledger query support (§33 review):
-- listSalesForBuyer filters buyer_handle + created_at DESC.
create index if not exists sales_buyer_created_idx
  on public.sales(buyer_handle, created_at desc);

-- Newly Claimed + Fastest Rising filter previous_price_cents with recency.
create index if not exists sales_first_claim_idx
  on public.sales(previous_price_cents, created_at desc)
  where previous_price_cents = 0;

-- SECURITY DEFINER so the service role can call it; PUBLIC must not (it
-- exposes per-handle traffic patterns). The service role is the only caller
-- in request paths (holder-analytics.ts).
revoke all on function public.holder_analytics(text, timestamptz) from public;
do $$
begin
  grant execute on function public.holder_analytics(text, timestamptz) to service_role;
exception when undefined_object then null;
end $$;
