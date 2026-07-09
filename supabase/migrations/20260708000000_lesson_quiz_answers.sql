-- ============================================================================
-- Quick Check answer persistence — ADDITIVE · mobile project (wrbauxutkysljmsqojts)
--
-- ⚠️ NOT YET APPLIED — generate-only. Apply to the shared project via the Supabase
-- dashboard SQL editor (MCP is read-only; `db push` is unsafe — empty remote history).
--
-- Why: user_lesson_quiz_progress previously stored only completion + score, so a
-- lesson "Quick Check" (LessonQuiz) lost the user's selections whenever the
-- component unmounted — on exit → re-enter a lesson, and on toggling between a
-- content page and the quiz screen within the same lesson. These three columns
-- mirror user_submodule_practice_progress so LessonQuiz can persist + resume
-- answers the same way PracticeQuiz already does.
--
-- Safe on the shared DB: user_lesson_quiz_progress is a WEB-owned table — mobile's
-- lesson quizzes use user_quiz_attempts / user_quiz_responses, not this table — and
-- these columns are additive (defaulted, so existing rows and any `select *` reads
-- keep working). ADD COLUMN IF NOT EXISTS keeps the file replayable. Existing
-- own-row RLS policies + table grants already cover the new columns.
-- ============================================================================

alter table public.user_lesson_quiz_progress
  add column if not exists answers jsonb not null default '{}'::jsonb,
  add column if not exists current_question_index smallint not null default 0,
  add column if not exists current_submitted boolean not null default false;
