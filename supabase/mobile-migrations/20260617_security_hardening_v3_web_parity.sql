-- Mobile Supabase parity for PR #25 security hardening.
--
-- Ports the relevant parts of 20260606150000_security_hardening.sql (the web-app
-- pre-launch hardening) to the legacy MOBILE project `unify-social`
-- (project ref wrbauxutkysljmsqojts). Applied manually via the Dashboard SQL
-- editor on 2026-06-17 and verified with the Supabase security advisors:
--   * 0028 (anon can execute SECURITY DEFINER): pin_post, unpin_post,
--     get_post_metadata_batch, merge_highlights no longer listed.
--   * 0011 (function search_path mutable): set_updated_at no longer listed.
--   * 0029 (authenticated can execute) still lists the 4 RPCs — by design;
--     signed-in users must call them and each guards on auth.uid().
--
-- IMPORTANT — this file documents a change made to the MOBILE database, not the
-- web-app database. It uses the MOBILE function signatures, which differ from the
-- web-app ones: pin_post/unpin_post take `integer` (web-app: `bigint`), and
-- merge_highlights is the 11-arg block-level variant (web-app: 3-arg). Do NOT run
-- this against the web-app project — the signatures won't match there.
--
-- It lives in `supabase/mobile-migrations/` — deliberately NOT in
-- `supabase/migrations/` — so it stays in version control but is OUTSIDE the
-- web-app's executable migration chain (`supabase db push` against the web-app
-- project never replays it, where the `integer`/11-arg signatures would fail).
-- The mobile team mirrors it into unify-front-end/supabase/migrations/.
--
-- Scope note vs PR #25: only the items that were net-new on mobile are included.
-- PR #25 section 2 (count-sync trigger fns) and section 4 (avatars/post_images
-- storage listing policies) are N/A on mobile — those functions/buckets/policies
-- do not exist there — and the 4 RPCs already had search_path pinned on mobile.

-- ---------------------------------------------------------------------------
-- 1. Callable RPCs — remove the default PUBLIC/anon EXECUTE, keep authenticated.
--    Postgres grants EXECUTE to PUBLIC by default (which includes anon). On
--    mobile these grants were never revoked (the live ACL still showed PUBLIC +
--    anon), so anon could call them despite the explicit `to authenticated`
--    grant. Each function already guards on auth.uid(), but anon should not be
--    able to invoke them at all.
-- ---------------------------------------------------------------------------
revoke execute on function public.pin_post(integer)                 from public, anon;
revoke execute on function public.unpin_post(integer)               from public, anon;
revoke execute on function public.get_post_metadata_batch(bigint[]) from public, anon;
revoke execute on function public.merge_highlights(
  uuid[], text, text, text, integer, integer, text, text, text, text, integer) from public, anon;

grant execute on function public.pin_post(integer)                  to authenticated, service_role;
grant execute on function public.unpin_post(integer)                to authenticated, service_role;
grant execute on function public.get_post_metadata_batch(bigint[])  to authenticated, service_role;
grant execute on function public.merge_highlights(
  uuid[], text, text, text, integer, integer, text, text, text, text, integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Pin search_path on set_updated_at — the one PR #25 function still flagged
--    mutable (0011) on mobile. The 4 RPCs above were already pinned on mobile.
-- ---------------------------------------------------------------------------
alter function public.set_updated_at() set search_path = public;
