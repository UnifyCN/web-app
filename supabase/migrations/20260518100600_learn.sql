-- Learn progress — module/lesson progress and saved highlights.
-- Source: CLAUDE.md schema reference.
-- Module and lesson content live in Sanity, so module_id / sanity_lesson_id /
-- lesson_id are plain text references, not Postgres foreign keys.

-- ----------------------------------------------------------------------------
-- learn_progress — per-module status
-- ----------------------------------------------------------------------------
create table public.learn_progress (
  user_id uuid not null references public.users(id) on delete cascade,
  module_id text not null,
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'completed')),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, module_id)
);

-- ----------------------------------------------------------------------------
-- user_lesson_progress — per-lesson progress
-- ----------------------------------------------------------------------------
create table public.user_lesson_progress (
  user_id uuid not null references public.users(id) on delete cascade,
  sanity_lesson_id text not null,
  progress_percent smallint not null default 0
    check (progress_percent between 0 and 100),
  is_completed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, sanity_lesson_id)
);

-- ----------------------------------------------------------------------------
-- lesson_highlights — text a user highlighted within a lesson page
-- ----------------------------------------------------------------------------
create table public.lesson_highlights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  lesson_id text not null,
  page_key text not null,
  selected_text text not null,
  created_at timestamptz not null default now()
);

create index idx_lesson_highlights_user_lesson
  on public.lesson_highlights(user_id, lesson_id);

-- ----------------------------------------------------------------------------
-- Row Level Security — all rows private to the owning user
-- ----------------------------------------------------------------------------
alter table public.learn_progress enable row level security;
alter table public.user_lesson_progress enable row level security;
alter table public.lesson_highlights enable row level security;

create policy "learn_progress_select_own" on public.learn_progress
  for select to authenticated using (user_id = auth.uid());
create policy "learn_progress_insert_own" on public.learn_progress
  for insert to authenticated with check (user_id = auth.uid());
create policy "learn_progress_update_own" on public.learn_progress
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "lesson_progress_select_own" on public.user_lesson_progress
  for select to authenticated using (user_id = auth.uid());
create policy "lesson_progress_insert_own" on public.user_lesson_progress
  for insert to authenticated with check (user_id = auth.uid());
create policy "lesson_progress_update_own" on public.user_lesson_progress
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "lesson_highlights_select_own" on public.lesson_highlights
  for select to authenticated using (user_id = auth.uid());
create policy "lesson_highlights_insert_own" on public.lesson_highlights
  for insert to authenticated with check (user_id = auth.uid());
create policy "lesson_highlights_delete_own" on public.lesson_highlights
  for delete to authenticated using (user_id = auth.uid());
