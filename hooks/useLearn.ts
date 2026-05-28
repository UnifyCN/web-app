import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as learn from "@/services/learn";
import type { LearnModuleView, ModuleStatus } from "@/types";

/** React Query hooks for Learn (Sanity content + Supabase progress). */

const MODULES_KEY = ["modules"] as const;
const LESSON_PROGRESSES_KEY = ["lesson-progresses"] as const;
const LEARNING_PROGRESS_KEY = ["learning-progress"] as const;

export function useModules() {
  return useQuery({ queryKey: MODULES_KEY, queryFn: learn.getModules });
}

export function useModule(id: string) {
  return useQuery({
    queryKey: [...MODULES_KEY, id],
    queryFn: () => learn.getModule(id),
    enabled: !!id,
  });
}

export function useLesson(id: string) {
  return useQuery({
    queryKey: ["lessons", id],
    queryFn: () => learn.getLesson(id),
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
  return useQuery({
    queryKey: LEARNING_PROGRESS_KEY,
    queryFn: learn.getLearningProgressSummary,
  });
}

interface ToggleFavouriteInput {
  moduleId: string;
  isFavourite: boolean;
}

/**
 * Optimistic toggle on the modules list cache: flips the matching module's
 * `isFavourite` immediately. Restores on error, invalidates on success.
 */
export function useToggleFavouriteModule() {
  const queryClient = useQueryClient();
  return useMutation<
    void,
    Error,
    ToggleFavouriteInput,
    { previous: LearnModuleView[] | undefined }
  >({
    mutationFn: ({ moduleId, isFavourite }) =>
      learn.toggleFavouriteModule(moduleId, isFavourite),
    onMutate: async ({ moduleId, isFavourite }) => {
      await queryClient.cancelQueries({ queryKey: MODULES_KEY });
      const previous =
        queryClient.getQueryData<LearnModuleView[]>(MODULES_KEY);
      queryClient.setQueryData<LearnModuleView[]>(MODULES_KEY, (prev) =>
        (prev ?? []).map((m) =>
          m._id === moduleId ? { ...m, isFavourite } : m,
        ),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(MODULES_KEY, context.previous);
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
    onSuccess: (_data, { moduleId }) => {
      queryClient.invalidateQueries({ queryKey: MODULES_KEY });
      queryClient.invalidateQueries({ queryKey: [...MODULES_KEY, moduleId] });
      queryClient.invalidateQueries({ queryKey: LEARNING_PROGRESS_KEY });
    },
  });
}

interface SetLessonProgressInput {
  lessonId: string;
  progressPercent: number;
  isCompleted: boolean;
  /** Optional — when provided, invalidates the parent module's detail. */
  moduleId?: string;
}

export function useSetLessonProgress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ lessonId, progressPercent, isCompleted }: SetLessonProgressInput) =>
      learn.setLessonProgress(lessonId, progressPercent, isCompleted),
    onSuccess: (_data, { moduleId }) => {
      queryClient.invalidateQueries({ queryKey: LESSON_PROGRESSES_KEY });
      queryClient.invalidateQueries({ queryKey: MODULES_KEY });
      if (moduleId) {
        queryClient.invalidateQueries({
          queryKey: [...MODULES_KEY, moduleId],
        });
      }
    },
  });
}
