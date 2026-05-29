import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as checklist from "@/services/checklist";
import type { ChecklistTask } from "@/types";

/** React Query hooks for Checklist data. */

const TASKS_KEY = ["tasks"] as const;

export function useTasks() {
  return useQuery({ queryKey: TASKS_KEY, queryFn: checklist.getTasks });
}

/**
 * Toggle completion with an optimistic cache update so the checkbox flips
 * instantly instead of waiting on the Sanity + Supabase refetch. Mirrors the
 * onMutate / onError / settle shape of useToggleFavouriteModule in useLearn.ts.
 */
export function useToggleTask() {
  const queryClient = useQueryClient();
  return useMutation<
    void,
    Error,
    checklist.ToggleTaskInput,
    { previous: ChecklistTask[] | undefined }
  >({
    mutationFn: checklist.toggleTask,
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: TASKS_KEY });
      const previous = queryClient.getQueryData<ChecklistTask[]>(TASKS_KEY);
      const nextCompleted = !input.completed;
      queryClient.setQueryData<ChecklistTask[]>(TASKS_KEY, (prev) =>
        (prev ?? []).map((task) =>
          task.id === input.id && task.isCustom === input.isCustom
            ? {
                ...task,
                completed: nextCompleted,
                completedAt: nextCompleted ? new Date().toISOString() : null,
              }
            : task,
        ),
      );
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(TASKS_KEY, context.previous);
      }
    },
    // Settle against the server after success AND error.
    onSettled: () => queryClient.invalidateQueries({ queryKey: TASKS_KEY }),
  });
}

export function useAddCustomTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: checklist.addCustomTask,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TASKS_KEY }),
  });
}

/**
 * Delete a user-created custom task, optimistically removing it from the cache.
 * The `task.isCustom` guard makes it impossible to drop a Sanity-sourced task
 * even if ids collided.
 */
export function useDeleteCustomTask() {
  const queryClient = useQueryClient();
  return useMutation<
    void,
    Error,
    string,
    { previous: ChecklistTask[] | undefined }
  >({
    mutationFn: checklist.deleteCustomTask,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: TASKS_KEY });
      const previous = queryClient.getQueryData<ChecklistTask[]>(TASKS_KEY);
      queryClient.setQueryData<ChecklistTask[]>(TASKS_KEY, (prev) =>
        (prev ?? []).filter((task) => !(task.isCustom && task.id === id)),
      );
      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(TASKS_KEY, context.previous);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: TASKS_KEY }),
  });
}
