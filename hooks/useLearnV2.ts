import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import * as learnV2 from "@/services/learnV2";
import type { LessonRef } from "@/services/learnV2";
import type { LessonPageType } from "@/lib/learn/v2/progress";
import { useLanguage } from "@/hooks/useLanguage";
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

/** A step was opened: saves only the resume position. Not invalidated on
 * success, so opening steps doesn't refetch every list. */
export function useSaveResumePosition() {
  return useMutation({
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
