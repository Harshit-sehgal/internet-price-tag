-- Migration 20260912_000004 — stop leaking moderation state on public profiles.
--
-- FINDING: `public.profiles` carries `suspended_at`, and its RLS policy is
-- "public read profiles" ... using (true). RLS filters ROWS, never COLUMNS, so
-- any holder of the anon key could `select id, handle, suspended_at from
-- profiles` and enumerate every suspended account. Moderation state is not
-- public information, and publishing it invites harassment of suspended users
-- and tips off abusers about when enforcement landed.
--
-- FIX: column-level privileges, which RLS cannot express. Revoke blanket
-- SELECT from the PostgREST roles and re-grant only the columns that are
-- genuinely public (the ones the holder profile page renders). `suspended_at`
-- is deliberately excluded.
--
-- WHY THIS IS SAFE HERE:
--  * No browser code queries `profiles` directly — every read in the app goes
--    through the service role in src/lib/repo.ts, and service_role is
--    unaffected by these grants.
--  * The realtime publication covers only public.domains and public.sales, so
--    no subscription depends on profile columns.
--  * Revoking the table and re-granting per column (rather than revoking the
--    single column) is deliberate: it fails CLOSED. A column added later is
--    not public until someone grants it explicitly here.
--
-- NOTE (follow-up, not fixed here): `profiles.id` is the auth.users UUID and
-- stays readable because `public.sales.buyer_user_id` already exposes it. If
-- that mapping is ever closed, close it in both places at once.

do $$
begin
  -- These roles exist on Supabase; on a plain Postgres test container they do
  -- not, and the migration must stay applicable there.
  begin
    revoke select on public.profiles from anon, authenticated;

    grant select (
      id,
      handle,
      display_name,
      avatar_url,
      created_at,
      bio,
      cta_label,
      cta_url
    ) on public.profiles to anon, authenticated;
  exception
    when undefined_object then null;
  end;
end $$;
