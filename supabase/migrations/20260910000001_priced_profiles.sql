-- Migration 20260910_000001 — Priced holder profiles: bio, external CTA.
-- Adds optional self-authored profile fields plus profile-view analytics
-- support (no table changes needed for analytics; analytics_events already
-- carries event + handle + created_at).
--
-- CTA fields are holder-authored and link offsite. Safety is enforced in the
-- application layer (https-only, length caps, safe rel attributes); the DB
-- keeps them optional and versionable like display_name/avatar_url.

alter table public.profiles
  add column if not exists bio text
    check (char_length(bio) <= 280),
  add column if not exists cta_label text
    check (char_length(cta_label) <= 40),
  add column if not exists cta_url text
    check (char_length(cta_url) <= 300);

-- Backfill nothing: all new columns are optional. RLS already enabled on
-- profiles; owner-writes happen through the service role from /api/profile,
-- public reads stay on the existing "public read profiles" policy.
