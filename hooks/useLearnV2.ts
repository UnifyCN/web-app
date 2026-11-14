import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import * as learnV2 from "@/services/learnV2";
import type { LessonRef } from "@/services/learnV2";
import type { LessonPageType } from "@/lib/learn/v2/progress";
import { useMemo, useRef } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import type { SanityQuizQuestion } from "@/types";
import {
  fromStoredAnswer,
  gradeQuizAnswer,
  toStoredAnswer,
} from "@/lib/learn/v2/quizAnswer";
import { LEARNING_PROGRESS_KEY, MODULES_KEY } from "@/hooks/useLearn";

/**
 * React Query hooks for Learn v2 (behind NEXT_PUBLIC_LEARN_V2). Content keys
 * carry the UI language right after the prefix, like hooks/useLearn.ts;
 * progress keys are language-agnostic. Progress writes invalidate both the v2
 * progress rows and the v1 module/summary keys, so the rest of the app
 * (Home's learning widget) stays current.
 */

export const COURSE_V2_KEY = ["learn-v2", "course"] as const;
export const LESSON_V2_KEY = ["learn-v2", "lesson"] as const;
export const LESSON_PROGRESS_ROWS_KEY = ["learn-v2", "progress"] as const;

export function useCourseV2(courseId: string) {
  const { currentLanguage } = useLanguage();
  return useQuery({
    queryKey: [...COURSE_V2_KEY, currentLanguage, courseId],
    queryFn: async () =>
      (await learnV2.getCourseV2(courseId, currentLanguage)) ?? null,
    enabled: !!courseId,
  });
}

export function useLessonV2(lessonId: string) {
  const { currentLanguage } = useLanguage();
  return useQuery({
    queryKey: [...LESSON_V2_KEY, currentLanguage, lessonId],
    queryFn: async () =>
      (await learnV2.getLessonV2(lessonId, currentLanguage)) ?? null,
    enabled: !!lessonId,
  });
}

/** All of the user's `user_lesson_progress` rows (resume + completion). */
export function useLessonProgressRows() {
  return useQuery({
    queryKey: LESSON_PROGRESS_ROWS_KEY,
    queryFn: learnV2.getLessonProgressRows,
  });
}

function useInvalidateProgress() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: LESSON_PROGRESS_ROWS_KEY });
    queryClient.invalidateQueries({ queryKey: ["lesson-progresses"] });
    queryClient.invalidateQueries({ queryKey: MODULES_KEY });
    queryClient.invalidateQueries({ queryKey: LEARNING_PROGRESS_KEY });
  };
}

export interface SaveLessonPageInput extends LessonRef {
  pageType: LessonPageType;
  pageNumber: number;
  totalPages: number;
  quiz?: { quizId: string; questionNumber: number };
}

/** Next pressed on a step: saves position + percentage. */
export function useSaveLessonPage() {
  const invalidate = useInvalidateProgress();
  return useMutation({
    mutationFn: ({
      pageType,
      pageNumber,
      totalPages,
      quiz,
      ...ids
    }: SaveLessonPageInput) =>
      learnV2.saveLessonPage(ids, pageType, pageNumber, totalPages, quiz),
    onSuccess: invalidate,
  });
}

export type SaveResumePositionInput = Omit<SaveLessonPageInput, "totalPages">;

/** A step was opened: saves only the resume position. Only the progress rows
 * refresh (for the Continue card and the Started filter), not every list. */
export function useSaveResumePosition() {
  const queryClient = useQueryClient();
  return useMutation({
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: LESSON_PROGRESS_ROWS_KEY }),
    mutationFn: ({
      pageType,
      pageNumber,
      quiz,
      ...ids
    }: SaveResumePositionInput) =>
      learnV2.saveResumePosition(ids, pageType, pageNumber, quiz),
  });
}

export function useCompleteLesson() {
  const invalidate = useInvalidateProgress();
  return useMutation({
    mutationFn: ({ totalPages, ...ids }: LessonRef & { totalPages: number }) =>
      learnV2.completeLesson(ids, totalPages),
    onSuccess: invalidate,
  });
}

/** Warms a course page (same key and fetcher as `useCourseV2`). */
export function prefetchCourseV2(
  queryClient: QueryClient,
  language: string,
  courseId: string,
) {
  return queryClient.prefetchQuery({
    queryKey: [...COURSE_V2_KEY, language, courseId],
    // React Query rejects `undefined` data, so a missing course is null.
    queryFn: async () =>
      (await learnV2.getCourseV2(
        courseId,
        language as Parameters<typeof learnV2.getCourseV2>[1],
      )) ?? null,
  });
}

/** Warms the v2 progress rows (used by the Learn tab prefetch). */
export function prefetchLessonProgressRows(queryClient: QueryClient) {
  return queryClient.prefetchQuery({
    queryKey: LESSON_PROGRESS_ROWS_KEY,
    queryFn: learnV2.getLessonProgressRows,
  });
}

/* ---- Quick Check answers shared with mobile --------------------------- */

export const QUIZ_ANSWERS_KEY = ["learn-v2", "quiz-answers"] as const;

interface SyncQuiz {
  _id: string;
  questions?: SanityQuizQuestion[] | null;
}

type QuizSave = { answers: Record<string, string[]>; completed: boolean };

/**
 * Quick Check answers in mobile's tables (`user_quiz_attempts` /
 * `user_quiz_responses`). `data` is the open attempts' answers in web's form,
 * or null when no quiz has an open attempt (the reader then falls back to
 * web's old `user_lesson_quiz_progress`, read-only). `persistence` writes
 * changed answers to mobile's tables, one save at a time, and closes the
 * attempts when the quiz is finished.
 */
export function useQuizAnswerSync(
  ids: LessonRef,
  quizzes: SyncQuiz[] | undefined,
) {
  const queryClient = useQueryClient();
  const enabled = !!quizzes && quizzes.length > 0;
  const quizIds = (quizzes ?? []).map((q) => q._id).join(",");
  const query = useQuery({
    queryKey: [...QUIZ_ANSWERS_KEY, ids.lessonId, quizIds],
    enabled,
    staleTime: 0,
    queryFn: () => loadQuizAnswers(quizzes ?? []),
  });

  const attemptIds = useRef(new Map<string, string>());
  const saved = useRef(new Map<string, string>());
  const chain = useRef<Promise<unknown>>(Promise.resolve());

  const persistence = useMemo(() => {
    const saveNow = async ({ answers, completed }: QuizSave) => {
      const attemptFor = async (quizId: string) => {
        const known = attemptIds.current.get(quizId);
        if (known) return known;
        const id = await learnV2.getOrCreateQuizAttempt(quizId, ids);
        if (!id) throw new Error("No quiz attempt");
        attemptIds.current.set(quizId, id);
        return id;
      };
      for (const quiz of quizzes ?? []) {
        for (const question of quiz.questions ?? []) {
          const value = toStoredAnswer(question, answers[question._key]);
          if (value === undefined) continue;
          const marker = JSON.stringify(value);
          if (saved.current.get(question._key) === marker) continue;
          const attemptId = await attemptFor(quiz._id);
          const ok = await learnV2.saveQuizResponse(
            attemptId,
            question._key,
            question.question_type,
            value,
            gradeQuizAnswer(question, value),
          );
          if (!ok) throw new Error("Quiz answer not saved");
          saved.current.set(question._key, marker);
        }
      }
      if (completed) {
        for (const quiz of quizzes ?? []) {
          const attemptId =
            attemptIds.current.get(quiz._id) ??
            (await learnV2.getOpenQuizAttempt(quiz._id))?.attemptId;
          if (attemptId) await learnV2.closeQuizAttempt(attemptId);
          attemptIds.current.delete(quiz._id);
        }
        saved.current.clear();
        await queryClient.invalidateQueries({ queryKey: QUIZ_ANSWERS_KEY });
      }
    };
    return {
      save(input: QuizSave) {
        const run = chain.current.then(() => saveNow(input));
        chain.current = run.catch(() => undefined);
        return run;
      },
    };
    // Rebuilt only when the lesson's quizzes or ids change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizzes, ids.lessonId, ids.submoduleId, ids.moduleId, queryClient]);

  return { ...query, persistence };
}

/** Open attempts' answers in web form, or null when no quiz has one. */
export async function loadQuizAnswers(
  quizzes: SyncQuiz[],
): Promise<{ answers: Record<string, string[]> } | null> {
  const answers: Record<string, string[]> = {};
  let found = false;
  for (const quiz of quizzes) {
    const open = await learnV2.getOpenQuizAttempt(quiz._id);
    if (!open) continue;
    found = true;
    for (const question of quiz.questions ?? []) {
      const value = fromStoredAnswer(question, open.responses[question._key]);
      if (value) answers[question._key] = value;
    }
  }
  return found ? { answers } : null;
}
