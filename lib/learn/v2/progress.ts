import type { LessonQuizStub } from "./types";

/*
 * Lesson progress with the mobile app's semantics, so web and mobile read and
 * write the same `user_lesson_progress` row the same way (upsert key
 * `user_id,sanity_lesson_id`). Ported from mobile:
 *   services/progress/progressService.ts (updateLessonProgress, saveResumePosition)
 *   hooks/progress/useLessonProgress.ts   (saveLessonCompletion)
 *   utils/submoduleProgress.ts            (getLessonTotalPages)
 *   utils/lessonResume.ts                 (isResumable, lessonResumeHref)
 */

/** `current_page_type` values the web reader writes. The shared check
 * constraint also allows `intro`, `activity` and `ending`; the ordered reader
 * plays activities and endings as `lesson` steps, as mobile does. */
export type LessonPageType = "lesson" | "quiz";

export interface LessonProgressRow {
  sanity_lesson_id: string;
  sanity_submodule_id?: string | null;
  sanity_module_id?: string | null;
  is_completed?: boolean | null;
  is_in_progress?: boolean | null;
  progress_percent?: number | null;
  total_pages?: number | null;
  completed_pages?: number | null;
  current_page_type?: string | null;
  current_page_number?: number | null;
  current_quiz_id?: string | null;
  current_question_number?: number | null;
  last_accessed_at?: string | null;
}

interface LessonIds {
  lessonId: string;
  submoduleId: string;
  moduleId: string;
}

const count = (n: unknown) =>
  typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;

/**
 * Canonical denominator for `total_pages`: lesson steps + activity pages +
 * quiz questions + ending pages. With content blocks the activity and ending
 * counts are 0 (they are steps). Every writer of `total_pages` must use this,
 * or the same lesson gets different totals depending on which screen wrote it.
 */
export function getLessonTotalPages(
  lesson:
    | {
        lesson_page_count?: number | null;
        activity_page_count?: number | null;
        ending_page_count?: number | null;
        quizzes?: LessonQuizStub[] | null;
      }
    | null
    | undefined,
): number {
  if (!lesson) return 0;
  const quizPages = (lesson.quizzes ?? []).reduce(
    (sum, quiz) => sum + count(quiz?.question_count),
    0,
  );
  return (
    count(lesson.lesson_page_count) +
    count(lesson.activity_page_count) +
    count(lesson.ending_page_count) +
    quizPages
  );
}

/** Upsert body when the user presses Next on step `pageNumber` (pages 1..N done). */
export function buildPageProgress(
  ids: LessonIds,
  pageType: LessonPageType,
  pageNumber: number,
  totalPages: number,
  now: Date,
  quiz?: { quizId: string; questionNumber: number },
) {
  const completedPages = Math.min(pageNumber, totalPages);
  const progressPercent =
    totalPages > 0 ? Math.round((completedPages / totalPages) * 100) : 0;
  return {
    sanity_lesson_id: ids.lessonId,
    sanity_submodule_id: ids.submoduleId,
    sanity_module_id: ids.moduleId,
    is_in_progress: true,
    current_page_type: pageType,
    current_page_number: pageNumber,
    total_pages: totalPages,
    completed_pages: completedPages,
    progress_percent: progressPercent,
    last_accessed_at: now.toISOString(),
    ...(quiz?.quizId ? { current_quiz_id: quiz.quizId } : {}),
    ...(quiz?.questionNumber
      ? { current_question_number: quiz.questionNumber }
      : {}),
  };
}

/** Upsert body that saves only the resume position (a step was opened). It
 * never touches the percentage or completion. */
export function buildResumePosition(
  ids: LessonIds,
  pageType: LessonPageType,
  pageNumber: number,
  now: Date,
  quiz?: { quizId: string; questionNumber: number },
) {
  return {
    sanity_lesson_id: ids.lessonId,
    sanity_submodule_id: ids.submoduleId,
    sanity_module_id: ids.moduleId,
    is_in_progress: true,
    current_page_type: pageType,
    current_page_number: pageNumber,
    last_accessed_at: now.toISOString(),
    ...(quiz?.quizId ? { current_quiz_id: quiz.quizId } : {}),
    ...(quiz?.questionNumber
      ? { current_question_number: quiz.questionNumber }
      : {}),
  };
}

/** Upsert body when the lesson is finished. */
export function buildCompletion(ids: LessonIds, totalPages: number, now: Date) {
  const at = now.toISOString();
  return {
    sanity_lesson_id: ids.lessonId,
    sanity_submodule_id: ids.submoduleId,
    sanity_module_id: ids.moduleId,
    progress_percent: 100,
    total_pages: totalPages,
    completed_pages: totalPages,
    is_completed: true,
    is_in_progress: false,
    completed_at: at,
    last_accessed_at: at,
  };
}

/** A started, unfinished lesson. */
export function isResumable(row?: LessonProgressRow | null): boolean {
  return Boolean(
    row &&
    !row.is_completed &&
    (row.is_in_progress || (row.completed_pages ?? 0) > 0),
  );
}

const positive = (n?: number | null) =>
  typeof n === "number" && Number.isFinite(n) ? Math.max(1, Math.floor(n)) : 1;

/**
 * Where to resume a lesson in the web reader. Steps are `?step=N`; quizzes
 * `?quiz=<id>&q=N`. An old `activity` / `ending` position is mapped to its
 * block by `mapLegacy` (see `getOrderedLegacyPageNumber`) and otherwise falls
 * back to step 1. An `intro` position belongs to the module page.
 */
export function lessonResumeHref(
  ids: LessonIds,
  row?: LessonProgressRow | null,
  mapLegacy?: (type: "activity" | "ending", page: number) => number | undefined,
): string {
  const base = `/learn/${ids.moduleId}/${ids.submoduleId}/${ids.lessonId}`;
  const type = row?.current_page_type;
  const page = positive(row?.current_page_number);
  if (type === "quiz" && row?.current_quiz_id) {
    return `${base}?quiz=${encodeURIComponent(row.current_quiz_id)}&q=${positive(row.current_question_number)}`;
  }
  if (type === "activity" || type === "ending") {
    // Mapping needs the lesson's blocks. Without them (lists), hand the old
    // position to the reader, which maps it as mobile's legacy routes do.
    const mapped = mapLegacy?.(type, page);
    return mapped !== undefined
      ? `${base}?step=${mapped}`
      : `${base}?legacy=${type}&page=${page}`;
  }
  if (type === "intro") return `/learn/${ids.moduleId}/${ids.submoduleId}`;
  return `${base}?step=${page}`;
}

/** Completed lessons / all lessons, as a whole percentage (course and module rows). */
export function completionPercent(
  lessonIds: readonly string[],
  completed: ReadonlySet<string>,
): number {
  if (lessonIds.length === 0) return 0;
  const done = lessonIds.filter((id) => completed.has(id)).length;
  return Math.round((done / lessonIds.length) * 100);
}
