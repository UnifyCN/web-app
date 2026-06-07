-- Pre-launch security hardening.
--
-- Clears the WARN-level Supabase advisories surfaced before launch:
--   * 0028/0029 — SECURITY DEFINER functions executable by anon / authenticated
--   * 0011      — function search_path mutable
--   * 0025      — public storage buckets allow listing
--
-- No table data or RLS policy logic changes. The live DB already has all the
-- objects referenced below; the `if exists` / `or replace` style keeps this
-- safe to re-run and order-independent on fresh rebuilds.

-- ---------------------------------------------------------------------------
-- 1. Callable RPCs — remove the default PUBLIC/anon EXECUTE, keep authenticated.
--    Postgres grants EXECUTE to PUBLIC by default (which includes anon); the
--    blanket `grant execute on all routines ... to authenticated` in
--    20260518100800_grants.sql does not remove that, so anon could still call
--    these. Each function already guards on auth.uid(), but anon should not be
--    able to invoke them at all.
-- ---------------------------------------------------------------------------
revoke execute on function public.pin_post(bigint)                     from public, anon;
revoke execute on function public.unpin_post(bigint)                   from public, anon;
revoke execute on function public.get_post_metadata_batch(bigint[])    from public, anon;
revoke execute on function public.merge_highlights(text, text, text[]) from public, anon;

grant execute on function public.pin_post(bigint)                      to authenticated;
grant execute on function public.unpin_post(bigint)                    to authenticated;
grant execute on function public.get_post_metadata_batch(bigint[])     to authenticated;
grant execute on function public.merge_highlights(text, text, text[])  to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Trigger functions — they fire in trigger context regardless of EXECUTE
--    grants, so no role needs to call them directly. Revoke from everyone to
--    clear the advisory without affecting trigger behaviour.
--    (is_circle_member is intentionally left alone: it is an RLS helper that
--    `authenticated` must be able to execute.)
-- ---------------------------------------------------------------------------
revoke execute on function public.update_post_like_count()        from public, anon, authenticated;
revoke execute on function public.update_post_comment_count()     from public, anon, authenticated;
revoke execute on function public.update_conversation_timestamp() from public, anon, authenticated;
revoke execute on function public.update_group_member_count()     from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Pin search_path on every flagged function (matches the pattern already
--    used by check_and_increment_chatbot_usage).
-- ---------------------------------------------------------------------------
alter function public.pin_post(bigint)                        set search_path = public;
alter function public.unpin_post(bigint)                      set search_path = public;
alter function public.get_post_metadata_batch(bigint[])       set search_path = public;
alter function public.merge_highlights(text, text, text[])    set search_path = public;
alter function public.update_post_like_count()                set search_path = public;
alter function public.update_post_comment_count()             set search_path = public;
alter function public.update_conversation_timestamp()         set search_path = public;
alter function public.update_group_member_count()             set search_path = public;
alter function public.set_updated_at()                        set search_path = public;

-- ---------------------------------------------------------------------------
-- 4. Public storage buckets do not need a broad SELECT policy on
--    storage.objects — object URLs are served via the public CDN endpoint
--    regardless. The broad SELECT policy only enables listing the whole bucket,
--    so drop it. (avatars_select_public is created by the avatars-upload work
--    on feat/profile-page; `if exists` keeps this safe before that merges, and
--    the live DB already has the policy.)
-- ---------------------------------------------------------------------------
drop policy if exists "avatars_select_public"     on storage.objects;
drop policy if exists "post_images_select_public" on storage.objects;
