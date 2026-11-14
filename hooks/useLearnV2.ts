import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import * as learnV2 from "@/services/learnV2";
import type { LessonRef } from "@/services/learnV2";
import type { LessonPageType } from "@/lib/learn/v2/progress";
import { useMemo, useState } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import type { SanityQuizQuestion } from "@/types";
import {
  fromStoredAnswer,
  gradeQuizAnswer,
  toStoredAnswer,
} from "@/lib/learn/v2/quizAnswer";
import { LEARNING_PROGRESS_KEY, MODULES_KEY } from "@/hooks/useLearn";
import { getAuthUserId, isSupabaseConfigured } from "@/lib/supabase/client";

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
type QuizAnswersData = { answers: Record<string, string[]> } | null;

/**
 * Quick Check answers in mobile's tables (`user_quiz_attempts` /
 * `user_quiz_responses`). `data` is the open attempts' answers in web's form
 * (empty once a shared attempt has been finished, so the quiz starts fresh),
 * or null when the user never started the quiz there (the reader then falls
 * back to web's old `user_lesson_quiz_progress`, read-only). `persistence`
 * writes changed answers to mobile's tables, one save at a time, and closes
 * the attempts when the quiz is finished.
 */
export function useQuizAnswerSync(
  ids: LessonRef,
  quizzes: SyncQuiz[] | undefined,
) {
  const queryClient = useQueryClient();
  const enabled = !!quizzes && quizzes.length > 0;
  const quizIds = (quizzes ?? []).map((q) => q._id).join(",");
  const queryKey = useMemo(
    () => [...QUIZ_ANSWERS_KEY, ids.lessonId, quizIds],
    [ids.lessonId, quizIds],
  );
  const query = useQuery({
    queryKey,
    enabled,
    staleTime: 0,
    queryFn: () => loadQuizAnswers(quizzes ?? []),
  });

  // Kept across rebuilds (a quiz refetch hands over a new array).
  // A mutable holder, made once per mount (not React state that renders).
  const [state] = useState<QuizSaveState>(newQuizSaveState);
  const persistence = useMemo(
    () =>
      createQuizPersistence({
        quizzes: quizzes ?? [],
        ids,
        state,
        queryClient,
        queryKey,
      }),
    // Rebuilt only when the lesson's quizzes or ids change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      quizzes,
      ids.lessonId,
      ids.submoduleId,
      ids.moduleId,
      queryClient,
      queryKey,
    ],
  );

  return { ...query, persistence };
}

/** Per-account save state: which attempt each quiz writes to, which answers
 * are already stored, and whether this run's attempts were closed. */
export interface QuizSaveState {
  owner: string | null | undefined;
  attemptIds: Map<string, string>;
  saved: Map<string, string>;
  finished: boolean;
  chain: Promise<unknown>;
}

export function newQuizSaveState(): QuizSaveState {
  return {
    owner: undefined,
    attemptIds: new Map(),
    saved: new Map(),
    finished: false,
    chain: Promise.resolve(),
  };
}

/** Writes Quick Check answers to mobile's tables, one save at a time. */
export function createQuizPersistence({
  quizzes,
  ids,
  state,
  queryClient,
  queryKey,
}: {
  quizzes: SyncQuiz[];
  ids: LessonRef;
  state: QuizSaveState;
  queryClient: QueryClient;
  queryKey: readonly unknown[];
}) {
  // The signed-in account (a fixed owner in mock mode, which has no session).
  const currentOwner = async () =>
    isSupabaseConfigured() ? await getAuthUserId() : "mock";
  const reset = () => {
    state.attemptIds.clear();
    state.saved.clear();
    state.finished = false;
  };
  const attemptFor = async (quizId: string) => {
    const known = state.attemptIds.get(quizId);
    if (known) return known;
    const id = await learnV2.getOrCreateQuizAttempt(quizId, ids);
    if (!id) throw new Error("No quiz attempt");
    state.attemptIds.set(quizId, id);
    return id;
  };
  const saveNow = async ({ answers, completed }: QuizSave) => {
    // A different account signed in while the reader stayed open.
    const userId = await currentOwner();
    if (state.owner !== userId) {
      state.owner = userId;
      reset();
    }
    if (state.finished) {
      // A retry after the attempts were closed (lesson completion failed):
      // nothing more to write, and no new attempt.
      if (completed) return;
      // Answering again after finishing starts a fresh attempt, as mobile.
      reset();
    }
    for (const quiz of quizzes) {
      for (const question of quiz.questions ?? []) {
        const value = toStoredAnswer(question, answers[question._key]);
        if (value === undefined) continue;
        const marker = JSON.stringify(value);
        if (state.saved.get(question._key) === marker) continue;
        const attemptId = await attemptFor(quiz._id);
        const ok = await learnV2.saveQuizResponse(
          attemptId,
          question._key,
          question.question_type,
          value,
          gradeQuizAnswer(question, value),
        );
        if (!ok) throw new Error("Quiz answer not saved");
        // Signed out or switched account while the write was in flight:
        // don't put this account's answers in the (user-less) cache key.
        if ((await currentOwner()) !== userId) return;
        state.saved.set(question._key, marker);
        // Keep the cached answers current, so reopening the quiz while the
        // reader stays mounted shows what was just saved.
        const answer = answers[question._key];
        queryClient.setQueryData<QuizAnswersData>(queryKey, (old) => ({
          answers: { ...(old?.answers ?? {}), [question._key]: answer },
        }));
      }
    }
    if (completed) {
      for (const quiz of quizzes) {
        const attemptId =
          state.attemptIds.get(quiz._id) ??
          (await learnV2.getOpenQuizAttempt(quiz._id))?.attemptId;
        if (attemptId) await learnV2.closeQuizAttempt(attemptId);
      }
      state.finished = true;
      await queryClient.invalidateQueries({ queryKey: QUIZ_ANSWERS_KEY });
    }
  };
  return {
    save(input: QuizSave) {
      const run = state.chain.then(() => saveNow(input));
      state.chain = run.catch(() => undefined);
      return run;
    },
  };
}

/** Open attempts' answers in web form. Empty when the shared attempts were
 * all finished; null when the user never started these quizzes there. */
export async function loadQuizAnswers(
  quizzes: SyncQuiz[],
): Promise<QuizAnswersData> {
  const answers: Record<string, string[]> = {};
  let found = false;
  for (const quiz of quizzes) {
    const open = await learnV2.getOpenQuizAttempt(quiz._id);
    if (!open) {
      if (await learnV2.hasQuizAttempt(quiz._id)) found = true;
      continue;
    }
    found = true;
    for (const question of quiz.questions ?? []) {
      const value = fromStoredAnswer(question, open.responses[question._key]);
      if (value) answers[question._key] = value;
    }
  }
  return found ? { answers } : null;
}
