-- Migration 20260910_000004 — hosted Supabase hardening.
-- Explicitly revoke privileged SECURITY DEFINER RPC execution from client roles
-- and optimize the quotes RLS auth lookup for hosted Supabase.

revoke execute on function public.finalize_takeover(text, uuid, text, bigint, bigint, text) from anon;
revoke execute on function public.finalize_takeover(text, uuid, text, bigint, bigint, text) from authenticated;
revoke execute on function public.holder_analytics(text, timestamptz) from anon;
revoke execute on function public.holder_analytics(text, timestamptz) from authenticated;

grant execute on function public.finalize_takeover(text, uuid, text, bigint, bigint, text) to service_role;
grant execute on function public.holder_analytics(text, timestamptz) to service_role;

drop policy if exists "owner reads own quotes" on public.quotes;
create policy "owner reads own quotes" on public.quotes for select
  using ((select auth.uid()) = buyer_user_id);
