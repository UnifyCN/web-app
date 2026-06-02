-- user_practice_progress — per-user quiz progress for a Learn section.
-- The web presents one combined quiz per submodule (section), flattening the
-- section's quiz-type `practice` documents, so progress is keyed by submodule
-- (one row per user+submodule). This diverges from mobile's per-practice key
-- but matches the web's flattened flow.
--
-- Submodule/module content lives in Sanity, so sanity_submodule_id /
-- sanity_module_id are plain text references, not Postgres foreign keys.

create table public.user_practice_progress (
  user_id uuid not null references public.users(id) on delete cascade,
  sanity_submodule_id text not null,
  sanity_module_id text,
  current_question_index smallint not null default 0,
  -- Whether the question at current_question_index has been submitted, so a
  -- resume restores its post-submit feedback + locked state.
  current_submitted boolean not null default false,
  -- Resume state: question `_key` -> the user's selected value(s).
  answers jsonb not null default '{}'::jsonb,
  is_completed boolean not null default false,
  score smallint,
  total_questions smallint,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, sanity_submodule_id)
);

-- No separate index on user_id — the primary key (user_id,
-- sanity_submodule_id) is already a btree with user_id as its leftmost column,
-- so single-column user_id lookups use the PK index.

alter table public.user_practice_progress enable row level security;

create policy "user_practice_progress_select_own" on public.user_practice_progress
  for select to authenticated using (user_id = auth.uid());
create policy "user_practice_progress_insert_own" on public.user_practice_progress
  for insert to authenticated with check (user_id = auth.uid());
create policy "user_practice_progress_update_own" on public.user_practice_progress
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- API-role grants (least privilege; RLS still gates row access). Mirrors
-- 20260518100800_grants.sql — explicit per-table grants so a `drop schema
-- public cascade` rebuild restores access for this table, which is created
-- after the baseline grants migration runs. No anon grant: rows are per-user
-- private.
grant all on public.user_practice_progress to service_role;
grant select, insert, update on public.user_practice_progress to authenticated;
