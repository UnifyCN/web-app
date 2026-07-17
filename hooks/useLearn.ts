import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as learn from "@/services/learn";
import type {
  PracticeFeedbackInput,
  UpsertLessonQuizProgressInput,
  UpsertPracticeProgressInput,
} from "@/services/learn";
import type { LearnModuleView, ModuleStatus } from "@/types";
import { useLanguage } from "@/hooks/useLanguage";

/**
 * React Query hooks for Learn (Sanity content + Supabase progress).
 *
 * Sanity-content keys carry the current UI language right after the prefix
 * (e.g. `["modules", lang]`, `["modules", lang, id]`) so a language switch
 * refetches localized content while prefix invalidations keep working.
 * Supabase progress keys are language-agnostic (progress is per-`_id`).
 */

const MODULES_KEY = ["modules"] as const;
const LESSON_PROGRESSES_KEY = ["lesson-progresses"] as const;
const LEARNING_PROGRESS_KEY = ["learning-progress"] as const;
const PRACTICES_KEY = ["practices"] as const;
const PRACTICE_PROGRESS_KEY = ["practice-progress"] as const;
const LESSON_QUIZ_KEY = ["lesson-quiz"] as const;
const LESSON_QUIZ_PROGRESS_KEY = ["lesson-quiz-progress"] as const;

export function useModules() {
  const { currentLanguage } = useLanguage();
  return useQuery({
    queryKey: [...MODULES_KEY, currentLanguage],
    queryFn: () => learn.getModules(currentLanguage),
  });
}

export function useModule(id: string) {
  const { currentLanguage } = useLanguage();
  return useQuery({
    queryKey: [...MODULES_KEY, currentLanguage, id],
    queryFn: () => learn.getModule(id, currentLanguage),
    enabled: !!id,
  });
}

export function useLesson(id: string) {
  const { currentLanguage } = useLanguage();
  return useQuery({
    queryKey: ["lessons", currentLanguage, id],
    queryFn: () => learn.getLesson(id, currentLanguage),
    enabled: !!id,
  });
}

/**
 * Returns the user's lesson progress as a map keyed by sanity_lesson_id.
 * Single query for all rows; callers filter to the lessons they render.
 */
export function useAllLessonProgresses() {
  return useQuery({
    queryKey: LESSON_PROGRESSES_KEY,
    queryFn: learn.getAllLessonProgresses,
  });
}

export function useLearningProgressSummary() {
  const { currentLanguage } = useLanguage();
  return useQuery({
    queryKey: [...LEARNING_PROGRESS_KEY, currentLanguage],
    queryFn: () => learn.getLearningProgressSummary(currentLanguage),
  });
}

/** Quiz-type practices for a section (Sanity content). */
export function usePractices(submoduleId: string) {
  return useQuery({
    queryKey: [...PRACTICES_KEY, submoduleId],
    queryFn: () => learn.getPractices(submoduleId),
    enabled: !!submoduleId,
  });
}

/** The user's quiz progress for a section (Supabase). */
export function usePracticeProgress(submoduleId: string) {
  return useQuery({
    queryKey: [...PRACTICE_PROGRESS_KEY, submoduleId],
    queryFn: () => learn.getPracticeProgress(submoduleId),
    enabled: !!submoduleId,
  });
}

/** All of the user's section quiz progress, keyed by submodule id (Supabase). */
export function useAllPracticeProgresses() {
  return useQuery({
    queryKey: [...PRACTICE_PROGRESS_KEY, "all"],
    queryFn: learn.getAllPracticeProgresses,
  });
}

export function useUpsertPracticeProgress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertPracticeProgressInput) =>
      learn.upsertPracticeProgress(input),
    onSuccess: () => {
      // Prefix invalidation refreshes both the per-section query and the
      // `[...,"all"]` query used by the module table of contents.
      queryClient.invalidateQueries({ queryKey: PRACTICE_PROGRESS_KEY });
      // Section/module progress surfaces may reflect quiz completion.
      queryClient.invalidateQueries({ queryKey: MODULES_KEY });
    },
  });
}

/**
 * AI coach feedback for a free-text practice answer (practice-feedback edge
 * function). Feedback is ephemeral — held in component state, not persisted —
 * so there's no cache to invalidate.
 */
export function usePracticeFeedback() {
  return useMutation({
    mutationFn: (input: PracticeFeedbackInput) =>
      learn.requestPracticeFeedback(input),
  });
}

/** A lesson's "Quick Check" quizzes (Sanity content). */
export function useLessonQuiz(lessonId: string) {
  return useQuery({
    queryKey: [...LESSON_QUIZ_KEY, lessonId],
    queryFn: () => learn.getLessonQuiz(lessonId),
    enabled: !!lessonId,
  });
}

/** The user's Quick Check completion for a lesson (Supabase). `enabled` lets a
 *  caller skip the round-trip for content-only lessons (no Quick Check). */
export function useLessonQuizProgress(lessonId: string, enabled = true) {
  return useQuery({
    queryKey: [...LESSON_QUIZ_PROGRESS_KEY, lessonId],
    queryFn: () => learn.getLessonQuizProgress(lessonId),
    enabled: enabled && !!lessonId,
  });
}

export function useUpsertLessonQuizProgress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertLessonQuizProgressInput) =>
      learn.upsertLessonQuizProgress(input),
    onSuccess: (_data, { lessonId }) => {
      queryClient.invalidateQueries({
        queryKey: [...LESSON_QUIZ_PROGRESS_KEY, lessonId],
      });
    },
  });
}

interface ToggleFavouriteInput {
  moduleId: string;
  isFavourite: boolean;
}

/**
 * Optimistic toggle on the modules list cache AND the single-module detail
 * cache (`["modules", id]`, used by the module detail page): flips the matching
 * module's `isFavourite` immediately. Restores both on error. Invalidating
 * `MODULES_KEY` also refreshes the detail query via React Query's prefix match.
 */
export function useToggleFavouriteModule() {
  const queryClient = useQueryClient();
  const { currentLanguage } = useLanguage();
  return useMutation<
    void,
    Error,
    ToggleFavouriteInput,
    {
      previousList: LearnModuleView[] | undefined;
      previousDetail: LearnModuleView | undefined;
      listKey: readonly unknown[];
      moduleKey: readonly unknown[];
    }
  >({
    mutationFn: ({ moduleId, isFavourite }) =>
      learn.toggleFavouriteModule(moduleId, isFavourite),
    onMutate: async ({ moduleId, isFavourite }) => {
      // Exact (language-aware) keys — setQueryData/getQueryData don't prefix-match.
      // Captured at mutation time and returned in context: onError must roll
      // back the SAME cache slot even if the user switches language mid-flight
      // (RQ v5 rebinds callbacks on re-render, so closures see the new language).
      const listKey = [...MODULES_KEY, currentLanguage];
      const moduleKey = [...MODULES_KEY, currentLanguage, moduleId];
      // Cancelling MODULES_KEY prefix-matches every language + the detail query.
      await queryClient.cancelQueries({ queryKey: MODULES_KEY });
      const previousList =
        queryClient.getQueryData<LearnModuleView[]>(listKey);
      const previousDetail =
        queryClient.getQueryData<LearnModuleView>(moduleKey);
      queryClient.setQueryData<LearnModuleView[]>(listKey, (prev) =>
        prev
          ? prev.map((m) => (m._id === moduleId ? { ...m, isFavourite } : m))
          : prev,
      );
      if (previousDetail) {
        queryClient.setQueryData<LearnModuleView>(moduleKey, {
          ...previousDetail,
          isFavourite,
        });
      }
      return { previousList, previousDetail, listKey, moduleKey };
    },
    onError: (_err, _vars, context) => {
      if (!context) return;
      if (context.previousList) {
        queryClient.setQueryData(context.listKey, context.previousList);
      }
      if (context.previousDetail) {
        queryClient.setQueryData(context.moduleKey, context.previousDetail);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MODULES_KEY });
    },
  });
}

interface SetModuleStatusInput {
  moduleId: string;
  status: ModuleStatus;
}

export function useSetModuleStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ moduleId, status }: SetModuleStatusInput) =>
      learn.setModuleStatus(moduleId, status),
    onSuccess: () => {
      // MODULES_KEY prefix-matches every language's list AND detail queries
      // (keys are ["modules", lang] / ["modules", lang, id]).
      queryClient.invalidateQueries({ queryKey: MODULES_KEY });
      queryClient.invalidateQueries({ queryKey: LEARNING_PROGRESS_KEY });
    },
  });
}

interface SetLessonProgressInput {
  lessonId: string;
  /** Parent section id — written to user_lesson_progress (NOT NULL on mobile). */
  submoduleId: string;
  /** Parent module id — written (NOT NULL) and used to invalidate the module detail. */
  moduleId: string;
  progressPercent: number;
  isCompleted: boolean;
}

export function useSetLessonProgress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      lessonId,
      submoduleId,
      moduleId,
      progressPercent,
      isCompleted,
    }: SetLessonProgressInput) =>
      learn.setLessonProgress(
        lessonId,
        submoduleId,
        moduleId,
        progressPercent,
        isCompleted,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LESSON_PROGRESSES_KEY });
      // Prefix-matches every language's list + detail queries.
      queryClient.invalidateQueries({ queryKey: MODULES_KEY });
      queryClient.invalidateQueries({ queryKey: LEARNING_PROGRESS_KEY });
    },
  });
}
