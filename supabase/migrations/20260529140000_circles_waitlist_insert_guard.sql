-- Follow-up to 20260529120000_circles.sql — CodeRabbit: tighten the waitlist
-- INSERT policy. waitlist_insert_own previously checked only user_id = auth.uid(),
-- letting a client insert an arbitrary persona / time_in_canada / pool_key (place
-- themselves in any matching pool, mismatch their real profile). Bind every
-- inserted row to the caller's onboarding profile.

-- Stage (0-4) -> mobile pool-key time slug. MUST stay in sync with
-- STAGE_TO_TIME_SLUG in services/community.ts (the client builds the same key).
create or replace function public.circle_time_slug(p_stage smallint)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_stage
    when 0 then 'not_arrived'
    when 1 then 'less_than_1_year'
    when 2 then 'less_than_1_year'
    when 3 then '1_to_2_years'
    when 4 then '3_plus_years'
  end;
$$;

revoke all on function public.circle_time_slug(smallint) from public;
grant execute on function public.circle_time_slug(smallint) to authenticated;

-- Re-create the INSERT policy with strict value binding: persona + time_in_canada
-- must match the caller's onboarding profile, and pool_key must equal the derived
-- persona__slug. No onboarding row -> the subqueries return null -> the equality
-- is null -> the insert is rejected (matches the service's "complete onboarding
-- first" guard). time_in_canada is table-constrained 0-4, so circle_time_slug is
-- never null for a valid row.
drop policy if exists "waitlist_insert_own" on public.community_match_waitlist;
create policy "waitlist_insert_own" on public.community_match_waitlist
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and persona = (
      select p.persona from public.user_onboarding_profiles p where p.id = auth.uid()
    )
    and time_in_canada = (
      select p.stage from public.user_onboarding_profiles p where p.id = auth.uid()
    )
    and pool_key = persona || '__' || public.circle_time_slug(time_in_canada)
  );
