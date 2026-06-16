-- ============================================================================
-- Web → Mobile shared-DB migration  ·  ADDITIVE schema for the web app
-- Target: mobile project  unify-social  (wrbauxutkysljmsqojts)
--
-- NOTE: this migration runs against the MOBILE Supabase project (the shared DB the
-- web app is cutting over to), NOT the web project. Apply it via the mobile project's
-- Supabase dashboard SQL editor.
--
-- SAFE ON PROD: only CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS
-- (all defaulted/nullable), new RLS on the new tables, and grants.
-- No existing mobile table/column/policy/function is modified or dropped.
-- Idempotent (re-runnable) and transactional (all-or-nothing).
--
-- Only data effect: the new `created_at` columns backfill EXISTING rows with
-- now() — nothing is overwritten.
--
-- FUTURE MIGRATIONS on live (populated) mobile tables: do NOT `ADD COLUMN ... DEFAULT
-- <value>` in one step on a large table. Use the 3-step lock-safe pattern to avoid an
-- ACCESS EXCLUSIVE lock / table rewrite:
--   (1) ADD COLUMN nullable (no default),
--   (2) ALTER COLUMN ... SET DEFAULT (metadata only — applies to new rows),
--   (3) backfill existing rows in batches (then add NOT NULL if needed).
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) learn_favourites  — web "favourite/star a module" (Sanity module id)
-- ----------------------------------------------------------------------------
create table if not exists public.learn_favourites (
  user_id          uuid not null references public.users(id) on delete cascade,
  sanity_module_id text not null,
  created_at       timestamptz not null default now(),
  primary key (user_id, sanity_module_id)
);
alter table public.learn_favourites enable row level security;

drop policy if exists learn_favourites_select_own on public.learn_favourites;
drop policy if exists learn_favourites_insert_own on public.learn_favourites;
drop policy if exists learn_favourites_delete_own on public.learn_favourites;
create policy learn_favourites_select_own on public.learn_favourites
  for select using (user_id = auth.uid());
create policy learn_favourites_insert_own on public.learn_favourites
  for insert with check (user_id = auth.uid());
create policy learn_favourites_delete_own on public.learn_favourites
  for delete using (user_id = auth.uid());

grant select, insert, delete on public.learn_favourites to authenticated;

-- ----------------------------------------------------------------------------
-- 2) user_lesson_quiz_progress  — web lesson "Quick Check" score per lesson
-- ----------------------------------------------------------------------------
create table if not exists public.user_lesson_quiz_progress (
  user_id          uuid not null references public.users(id) on delete cascade,
  sanity_lesson_id text not null,
  is_completed     boolean not null default false,
  score            smallint,
  total_questions  smallint,
  completed_at     timestamptz,
  updated_at       timestamptz not null default now(),
  primary key (user_id, sanity_lesson_id)
);
alter table public.user_lesson_quiz_progress enable row level security;

drop policy if exists user_lesson_quiz_progress_select_own on public.user_lesson_quiz_progress;
drop policy if exists user_lesson_quiz_progress_insert_own on public.user_lesson_quiz_progress;
drop policy if exists user_lesson_quiz_progress_update_own on public.user_lesson_quiz_progress;
create policy user_lesson_quiz_progress_select_own on public.user_lesson_quiz_progress
  for select using (user_id = auth.uid());
create policy user_lesson_quiz_progress_insert_own on public.user_lesson_quiz_progress
  for insert with check (user_id = auth.uid());
create policy user_lesson_quiz_progress_update_own on public.user_lesson_quiz_progress
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update on public.user_lesson_quiz_progress to authenticated;

-- ----------------------------------------------------------------------------
-- 3) user_submodule_practice_progress  — web's per-SUBMODULE practice quiz
--    (mobile's per-practice user_practice_progress is left untouched)
-- ----------------------------------------------------------------------------
create table if not exists public.user_submodule_practice_progress (
  user_id                uuid not null references public.users(id) on delete cascade,
  sanity_submodule_id    text not null,
  sanity_module_id       text,
  current_question_index smallint not null default 0,
  current_submitted      boolean not null default false,
  answers                jsonb not null default '{}'::jsonb,
  is_completed           boolean not null default false,
  score                  smallint,
  total_questions        smallint,
  completed_at           timestamptz,
  updated_at             timestamptz not null default now(),
  primary key (user_id, sanity_submodule_id)
);
alter table public.user_submodule_practice_progress enable row level security;

drop policy if exists user_submodule_practice_progress_select_own on public.user_submodule_practice_progress;
drop policy if exists user_submodule_practice_progress_insert_own on public.user_submodule_practice_progress;
drop policy if exists user_submodule_practice_progress_update_own on public.user_submodule_practice_progress;
create policy user_submodule_practice_progress_select_own on public.user_submodule_practice_progress
  for select using (user_id = auth.uid());
create policy user_submodule_practice_progress_insert_own on public.user_submodule_practice_progress
  for insert with check (user_id = auth.uid());
create policy user_submodule_practice_progress_update_own on public.user_submodule_practice_progress
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update on public.user_submodule_practice_progress to authenticated;

-- ----------------------------------------------------------------------------
-- 4) Additive columns on existing shared tables (all defaulted/nullable)
-- ----------------------------------------------------------------------------
alter table public.comment_likes  add column if not exists created_at timestamptz not null default now();
alter table public.post_likes     add column if not exists created_at timestamptz not null default now();
alter table public.post_saves     add column if not exists created_at timestamptz not null default now();
alter table public.user_followers add column if not exists created_at timestamptz not null default now();
alter table public.user_tasks     add column if not exists created_at timestamptz not null default now();

alter table public.messages       add column if not exists suggested_next_steps jsonb;

alter table public.news_details   add column if not exists category   text;
alter table public.news_details   add column if not exists created_at timestamptz not null default now();

commit;

-- ============================================================================
-- Verification (read-only) — should return all 3 new tables + 8 columns
-- ============================================================================
select 'table' as kind, table_name as name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('learn_favourites','user_lesson_quiz_progress','user_submodule_practice_progress')
union all
select 'column', table_name || '.' || column_name
from information_schema.columns
where table_schema = 'public' and (
  (table_name = 'comment_likes'  and column_name = 'created_at') or
  (table_name = 'post_likes'     and column_name = 'created_at') or
  (table_name = 'post_saves'     and column_name = 'created_at') or
  (table_name = 'user_followers' and column_name = 'created_at') or
  (table_name = 'user_tasks'     and column_name = 'created_at') or
  (table_name = 'messages'       and column_name = 'suggested_next_steps') or
  (table_name = 'news_details'   and column_name in ('category','created_at'))
)
order by 1, 2;
