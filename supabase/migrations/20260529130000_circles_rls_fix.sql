-- Follow-up to 20260529120000_circles.sql — CodeRabbit security fixes (PR #13).

-- 1. is_circle_member must not count members who have already left the circle,
-- otherwise former members keep passing every membership-gated RLS check.
create or replace function public.is_circle_member(p_circle_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.community_circle_members m
    where m.circle_id = p_circle_id
      and m.user_id = auth.uid()
      and m.left_at is null
  );
$$;

revoke all on function public.is_circle_member(uuid) from public;
grant execute on function public.is_circle_member(uuid) to authenticated;

-- 2. Circle membership is written only by the matching backend (service_role,
-- which bypasses RLS). Drop the self-write policies so an authenticated user
-- can't self-join an arbitrary circle and bypass matching. Keep only the
-- member/co-member SELECT policy.
drop policy if exists "circle_members_insert_own" on public.community_circle_members;
drop policy if exists "circle_members_update_own" on public.community_circle_members;
drop policy if exists "circle_members_delete_own" on public.community_circle_members;

-- 3. The client only joins (insert) and cancels (delete) a waitlist row, never
-- updates one. Drop the update policy that let a user rewrite their own
-- status / pool_key / persona / time_in_canada (move pools, self-mark matched).
drop policy if exists "waitlist_update_own" on public.community_match_waitlist;
