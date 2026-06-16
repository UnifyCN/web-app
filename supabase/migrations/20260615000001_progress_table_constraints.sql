-- ============================================================================
-- Progress-table CHECK constraints · ADDITIVE · mobile project (wrbauxutkysljmsqojts)
--
-- ⚠️ NOT YET APPLIED — generate-only. Apply to the MOBILE project via the Supabase
-- dashboard SQL editor, same as 20260615000000_web_mobile_shared_db.sql. These tables
-- were created by that migration and hold little/no data, so validation is brief.
--
-- Guards score / total_questions / current_question_index against negative or
-- inconsistent values on the web-owned progress tables.
-- ============================================================================

begin;

alter table public.user_lesson_quiz_progress
  add constraint user_lesson_quiz_progress_score_nonneg
    check (score is null or score >= 0),
  add constraint user_lesson_quiz_progress_total_questions_nonneg
    check (total_questions is null or total_questions >= 0),
  add constraint user_lesson_quiz_progress_score_lte_total
    check (score is null or total_questions is null or score <= total_questions);

alter table public.user_submodule_practice_progress
  add constraint user_submodule_practice_progress_score_nonneg
    check (score is null or score >= 0),
  add constraint user_submodule_practice_progress_total_questions_nonneg
    check (total_questions is null or total_questions >= 0),
  add constraint user_submodule_practice_progress_score_lte_total
    check (score is null or total_questions is null or score <= total_questions),
  add constraint user_submodule_practice_progress_qindex_nonneg
    check (current_question_index >= 0);

commit;
