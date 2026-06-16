-- ============================================================================
-- Progress-table CHECK constraints — FIX · ADDITIVE · mobile project (wrbauxutkysljmsqojts)
--
-- ⚠️ NOT YET APPLIED — generate-only. Apply to the MOBILE project via the Supabase
-- dashboard SQL editor, AFTER 20260615000001_progress_table_constraints.sql.
--
-- Why: total_questions >= 0 is wrong — a quiz/practice with 0 questions is
-- meaningless, and combined with `score <= total_questions` it would force score
-- to 0. Require total_questions > 0 when set. The score bounds follow the same
-- pattern: score >= 0 and score <= total_questions (when both are non-null).
--
-- DROP ... IF EXISTS makes this safe whether or not 20260615000001's constraints
-- were already applied. current_question_index >= 0 (practice table) is left as-is.
-- ============================================================================

begin;

-- ---- user_lesson_quiz_progress -------------------------------------------
alter table public.user_lesson_quiz_progress
  drop constraint if exists user_lesson_quiz_progress_total_questions_nonneg,
  drop constraint if exists user_lesson_quiz_progress_score_nonneg,
  drop constraint if exists user_lesson_quiz_progress_score_lte_total;

alter table public.user_lesson_quiz_progress
  add constraint user_lesson_quiz_progress_total_questions_positive
    check (total_questions is null or total_questions > 0),
  add constraint user_lesson_quiz_progress_score_nonneg
    check (score is null or score >= 0),
  add constraint user_lesson_quiz_progress_score_lte_total
    check (score is null or total_questions is null or score <= total_questions);

-- ---- user_submodule_practice_progress ------------------------------------
alter table public.user_submodule_practice_progress
  drop constraint if exists user_submodule_practice_progress_total_questions_nonneg,
  drop constraint if exists user_submodule_practice_progress_score_nonneg,
  drop constraint if exists user_submodule_practice_progress_score_lte_total;

alter table public.user_submodule_practice_progress
  add constraint user_submodule_practice_progress_total_questions_positive
    check (total_questions is null or total_questions > 0),
  add constraint user_submodule_practice_progress_score_nonneg
    check (score is null or score >= 0),
  add constraint user_submodule_practice_progress_score_lte_total
    check (score is null or total_questions is null or score <= total_questions);

commit;
