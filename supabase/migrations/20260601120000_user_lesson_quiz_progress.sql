-- user_lesson_quiz_progress — per-user completion of a lesson's "Quick Check"
-- quiz (Sanity `_type == "quiz"` docs that reference a lesson). One row per
-- (user, lesson); the lesson's quizzes are rendered as one combined inline quiz,
-- so completion is tracked at the lesson level.
--
-- Lesson content lives in Sanity, so sanity_lesson_id is a plain text reference,
-- not a Postgres foreign key.

create table public.user_lesson_quiz_progress (
  user_id uuid not null references public.users(id) on delete cascade,
  sanity_lesson_id text not null,
  is_completed boolean not null default false,
  score smallint,
  total_questions smallint,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, sanity_lesson_id)
);

-- No separate index on user_id — the primary key (user_id, sanity_lesson_id) is
-- already a btree with user_id as its leftmost column.

alter table public.user_lesson_quiz_progress enable row level security;

create policy "user_lesson_quiz_progress_select_own" on public.user_lesson_quiz_progress
  for select to authenticated using (user_id = auth.uid());
create policy "user_lesson_quiz_progress_insert_own" on public.user_lesson_quiz_progress
  for insert to authenticated with check (user_id = auth.uid());
create policy "user_lesson_quiz_progress_update_own" on public.user_lesson_quiz_progress
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- API-role grants (least privilege; RLS still gates row access). Mirrors
-- 20260518100800_grants.sql — explicit per-table grants so a `drop schema public
-- cascade` rebuild restores access. No anon grant: rows are per-user private.
grant all on public.user_lesson_quiz_progress to service_role;
grant select, insert, update on public.user_lesson_quiz_progress to authenticated;

-- Keep updated_at current on every UPDATE, not just the app's upsert path.
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger user_lesson_quiz_progress_set_updated_at
  before update on public.user_lesson_quiz_progress
  for each row execute function public.set_updated_at();
