-- Circles matching + chat tables — mirrors the mobile back-end schema so a
-- future cross-DB merge is clean. Replaces the earlier community_circles stub.
-- Wired this round: circle status read + waitlist join/cancel. The matching
-- engine, realtime, and chat surface are deferred (see BACKLOG.md ## Community).

-- ----------------------------------------------------------------------------
-- Replace the community_circles stub (empty, unreferenced) with the mobile shape.
-- The DROP also removes the old `circles_select` policy and the anon SELECT
-- grant from 20260518100800_grants.sql — intentionally NOT restored, because
-- circles are now member-private.
-- ----------------------------------------------------------------------------
drop table if exists public.community_circles cascade;

create table public.community_circles (
  id uuid primary key default gen_random_uuid(),
  persona text not null
    check (persona in ('international_student', 'skilled_worker', 'refugee', 'other')),
  -- time_in_canada mirrors the onboarding stage scale (0-4)
  time_in_canada smallint not null check (time_in_canada between 0 and 4),
  pool_key text not null,
  goal text,
  topics text[] not null default '{}',
  match_metadata jsonb not null default '{}'::jsonb,
  status text not null default 'active'
    check (status in ('active', 'ended')),
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_community_circles_pool on public.community_circles(pool_key);

-- ----------------------------------------------------------------------------
-- community_match_waitlist — per-user join queue for matching
-- ----------------------------------------------------------------------------
create table public.community_match_waitlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  persona text not null
    check (persona in ('international_student', 'skilled_worker', 'refugee', 'other')),
  time_in_canada smallint not null check (time_in_canada between 0 and 4),
  pool_key text not null,
  goal text,
  topics text[] not null default '{}',
  status text not null default 'waiting'
    check (status in ('waiting', 'matched', 'paused')),
  placement_deadline_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_waitlist_pool_status on public.community_match_waitlist(pool_key, status);
-- One active waiting row per user — the idempotency anchor for startCircleMatching.
create unique index uq_waitlist_user_waiting
  on public.community_match_waitlist(user_id) where status = 'waiting';

-- ----------------------------------------------------------------------------
-- community_circle_members — user <-> circle membership
-- ----------------------------------------------------------------------------
create table public.community_circle_members (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.community_circles(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  unique (circle_id, user_id)
);

create index idx_circle_members_user on public.community_circle_members(user_id);
create index idx_circle_members_circle on public.community_circle_members(circle_id);

-- ----------------------------------------------------------------------------
-- community_messages — circle chat (schema parity; not wired this round)
-- ----------------------------------------------------------------------------
create table public.community_messages (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.community_circles(id) on delete cascade,
  sender_user_id uuid not null references public.users(id) on delete cascade,
  content text not null,
  message_type text not null default 'text'
    check (message_type in ('text', 'system', 'icebreaker')),
  metadata jsonb not null default '{}'::jsonb,
  dedupe_key text,
  created_at timestamptz not null default now(),
  unique (circle_id, dedupe_key)
);

create index idx_messages_circle_created
  on public.community_messages(circle_id, created_at);

-- ----------------------------------------------------------------------------
-- Membership lookup helper — SECURITY DEFINER to break the circles <-> members
-- RLS recursion: a circle_members co-member policy that queries circle_members
-- would recurse (Postgres 42P17). The definer function runs without re-invoking
-- the policy. search_path is pinned to silence the mutable-search_path advisor.
-- ----------------------------------------------------------------------------
create or replace function public.is_circle_member(p_circle_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.community_circle_members m
    where m.circle_id = p_circle_id and m.user_id = auth.uid()
  );
$$;

revoke all on function public.is_circle_member(uuid) from public;
grant execute on function public.is_circle_member(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Row Level Security — own-row everywhere; circles/messages gated by membership.
-- (authenticated DML on these tables is inherited from the alter-default-
-- privileges in 20260518100800_grants.sql, which ran before this migration.)
-- ----------------------------------------------------------------------------
alter table public.community_circles enable row level security;
alter table public.community_match_waitlist enable row level security;
alter table public.community_circle_members enable row level security;
alter table public.community_messages enable row level security;

-- circles: visible only to their members; created/updated by the matching
-- backend (service_role bypasses RLS). No user-facing write policy.
create policy "circles_select" on public.community_circles
  for select to authenticated using (public.is_circle_member(id));

-- waitlist: fully private to the owning user.
create policy "waitlist_select_own" on public.community_match_waitlist
  for select to authenticated using (user_id = auth.uid());
create policy "waitlist_insert_own" on public.community_match_waitlist
  for insert to authenticated with check (user_id = auth.uid());
create policy "waitlist_update_own" on public.community_match_waitlist
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "waitlist_delete_own" on public.community_match_waitlist
  for delete to authenticated using (user_id = auth.uid());

-- circle_members: see your own row (always) or co-members (via the definer
-- helper, which avoids self-recursion); write only your own row.
create policy "circle_members_select" on public.community_circle_members
  for select to authenticated
  using (user_id = auth.uid() or public.is_circle_member(circle_id));
create policy "circle_members_insert_own" on public.community_circle_members
  for insert to authenticated with check (user_id = auth.uid());
create policy "circle_members_update_own" on public.community_circle_members
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "circle_members_delete_own" on public.community_circle_members
  for delete to authenticated using (user_id = auth.uid());

-- messages: circle members read and post (parity; unwired in the app this round).
create policy "messages_select" on public.community_messages
  for select to authenticated using (public.is_circle_member(circle_id));
create policy "messages_insert" on public.community_messages
  for insert to authenticated
  with check (public.is_circle_member(circle_id) and sender_user_id = auth.uid());
