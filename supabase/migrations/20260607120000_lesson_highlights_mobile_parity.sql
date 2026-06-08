-- Bring web `lesson_highlights` to mobile-schema parity so the two project
-- databases (web pbiszrycmcxmzxrnkkwr + mobile wrbauxutkysljmsqojts) can be
-- merged with compatible rows. Web shipped a simpler whole-page-text model
-- (id, user_id, lesson_id, page_key, selected_text, created_at); mobile stores
-- word-range highlights with block + navigation context. This adds the missing
-- columns/constraints/indexes/policy and replaces merge_highlights with mobile's
-- 11-arg signature.
--
-- Note on user_id: web keeps its FK to public.users(id) (consistent with every
-- other web table — public.users mirrors auth.users via the app-side bootstrap),
-- whereas mobile references auth.users(id). The stored value is the same auth
-- uid either way, so highlight rows remain merge-compatible.

-- ---------------------------------------------------------------------------
-- 1. Columns — add the 7 missing fields. Word indices default 0 and block_key
--    backfills to '' so the handful of legacy whole-page rows stay valid.
-- ---------------------------------------------------------------------------
alter table public.lesson_highlights
  add column if not exists block_key        text,
  add column if not exists start_word_index integer not null default 0,
  add column if not exists end_word_index   integer not null default 0,
  add column if not exists module_id        text,
  add column if not exists submodule_id     text,
  add column if not exists submodule_title  text,
  add column if not exists page_num         integer;

update public.lesson_highlights set block_key = '' where block_key is null;

alter table public.lesson_highlights
  alter column block_key set not null;

-- Match mobile: user_id auto-fills from the JWT (the app also sets it explicitly).
alter table public.lesson_highlights
  alter column user_id set default auth.uid();

-- ---------------------------------------------------------------------------
-- 2. Constraints — word-index sanity (mirrors mobile).
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'chk_non_negative_indices'
  ) then
    alter table public.lesson_highlights
      add constraint chk_non_negative_indices
      check (start_word_index >= 0 and end_word_index >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'chk_valid_range'
  ) then
    alter table public.lesson_highlights
      add constraint chk_valid_range
      check (start_word_index <= end_word_index);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Indexes — match mobile's lookup/submodule/lesson-page set. Drop the old
--    (user_id, lesson_id) index in favour of the page-scoped composite.
-- ---------------------------------------------------------------------------
drop index if exists idx_lesson_highlights_user_lesson;

create index if not exists idx_lesson_highlights_lookup
  on public.lesson_highlights (user_id, lesson_id, page_key);
create index if not exists idx_lesson_highlights_submodule
  on public.lesson_highlights (submodule_id)
  where submodule_id is not null;
create index if not exists idx_lesson_highlights_lesson_page
  on public.lesson_highlights (lesson_id, page_num);

-- ---------------------------------------------------------------------------
-- 4. RLS — add the missing own-row UPDATE policy (mobile has it; web didn't).
-- ---------------------------------------------------------------------------
drop policy if exists "lesson_highlights_update_own" on public.lesson_highlights;
create policy "lesson_highlights_update_own" on public.lesson_highlights
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 5. merge_highlights — replace the old 3-arg whole-page version with mobile's
--    11-arg overlap-merge (delete the supplied rows + insert the merged range,
--    atomically). The signature changes, so the old function must be dropped
--    first (create-or-replace can't alter an argument list).
-- ---------------------------------------------------------------------------
drop function if exists public.merge_highlights(text, text, text[]);

create or replace function public.merge_highlights(
  p_ids_to_delete    uuid[],
  p_lesson_id        text,
  p_page_key         text,
  p_block_key        text,
  p_start_word_index integer,
  p_end_word_index   integer,
  p_selected_text    text,
  p_module_id        text default null,
  p_submodule_id     text default null,
  p_submodule_title  text default null,
  p_page_num         integer default null
)
returns public.lesson_highlights
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result public.lesson_highlights;
  current_uid uuid := auth.uid();
begin
  if current_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Delete overlapping highlights scoped to this user + lesson/page/block.
  delete from public.lesson_highlights
  where id = any(p_ids_to_delete)
    and user_id = current_uid
    and lesson_id = p_lesson_id
    and page_key = p_page_key
    and block_key = p_block_key;

  -- Insert the merged highlight.
  insert into public.lesson_highlights (
    user_id, lesson_id, page_key, block_key,
    start_word_index, end_word_index, selected_text,
    module_id, submodule_id, submodule_title, page_num
  ) values (
    current_uid, p_lesson_id, p_page_key, p_block_key,
    p_start_word_index, p_end_word_index, p_selected_text,
    p_module_id, p_submodule_id, p_submodule_title, p_page_num
  )
  returning * into result;

  return result;
end;
$$;

-- Grants — match the security-hardening pattern: keep anon out, allow the app
-- roles. (search_path is already pinned inline above.)
revoke execute on function public.merge_highlights(
  uuid[], text, text, text, integer, integer, text, text, text, text, integer
) from public, anon;
grant execute on function public.merge_highlights(
  uuid[], text, text, text, integer, integer, text, text, text, text, integer
) to authenticated, service_role;
