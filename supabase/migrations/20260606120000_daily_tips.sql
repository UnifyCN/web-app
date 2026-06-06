-- daily_tips — per-user, per-day personalized settlement tip.
-- Generated on demand by the `get-daily-tip` edge function (service-role
-- upsert) and surfaced on the Community → "News & Tips" tab. Web-only port of
-- the mobile get-daily-tip: per user (onConflict user_id,date), not cohort-wide.

create table public.daily_tips (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  persona text,
  stage text,
  date date not null,
  category text,
  title text,
  description text,
  tip_text text,
  source_refs jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

-- The unique (user_id, date) btree also serves single-user lookups (user_id is
-- its leftmost column), so no separate user_id index is needed.

alter table public.daily_tips enable row level security;

-- Reads are own-row. Writes happen only via the service-role edge function,
-- which bypasses RLS, so there are no insert/update policies for authenticated.
create policy "daily_tips_select_own" on public.daily_tips
  for select to authenticated using (user_id = auth.uid());

grant select on public.daily_tips to authenticated;
