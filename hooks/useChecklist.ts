import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as checklist from "@/services/checklist";
import {
  trackChecklistTaskCompleted,
  trackChecklistTaskUncompleted,
} from "@/lib/analytics";
import type { ChecklistTask, Priority } from "@/types";
import { useLanguage } from "@/hooks/useLanguage";

/** Rebuild the full task list in priority order, replacing one bucket's order. */
function rebuildWithBucket(
  list: ChecklistTask[],
  priority: Priority,
  bucket: ChecklistTask[],
): ChecklistTask[] {
  const result: ChecklistTask[] = [];
  for (const p of checklist.PRIORITY_ORDER) {
    result.push(
      ...(p === priority ? bucket : list.filter((task) => task.priority === p)),
    );
  }
  return result;
}

/** React Query hooks for Checklist data. */

export const TASKS_KEY = ["tasks"] as const;

/** Exact (language-aware) tasks cache key: `["tasks", lang]`. Sanity checklist
 * content is localized, so the key carries the language AFTER the prefix —
 * `TASKS_KEY` prefix invalidations/cancellations still match, while
 * getQueryData/setQueryData (exact-key) use this. */
function useTasksKey() {
  const { currentLanguage } = useLanguage();
  return [...TASKS_KEY, currentLanguage] as const;
}

export function useTasks() {
  const { currentLanguage } = useLanguage();
  return useQuery({
    queryKey: [...TASKS_KEY, currentLanguage],
    queryFn: () => checklist.getTasks(currentLanguage),
    staleTime: 60_000,
  });
}

/**
 * Toggle completion with an optimistic cache update so the checkbox flips
 * instantly instead of waiting on the Sanity + Supabase refetch. Mirrors the
 * onMutate / onError / settle shape of useToggleFavouriteModule in useLearn.ts.
 */
export function useToggleTask() {
  const queryClient = useQueryClient();
  const tasksKey = useTasksKey();
  return useMutation<
    void,
    Error,
    checklist.ToggleTaskInput,
    { previous: ChecklistTask[] | undefined; tasksKey: readonly unknown[] }
  >({
    mutationFn: checklist.toggleTask,
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: TASKS_KEY });
      const previous = queryClient.getQueryData<ChecklistTask[]>(tasksKey);
      const nextCompleted = !input.completed;
      queryClient.setQueryData<ChecklistTask[]>(tasksKey, (prev) =>
        prev
          ? prev.map((task) =>
              task.id === input.id && task.isCustom === input.isCustom
                ? {
                    ...task,
                    completed: nextCompleted,
                    completedAt: nextCompleted
                      ? new Date().toISOString()
                      : null,
                  }
                : task,
            )
          : prev,
      );
      // Return the mutation-time key: a mid-flight language switch rebinds the
      // closure `tasksKey`, but rollback/analytics must hit the slot we wrote.
      return { previous, tasksKey };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(context.tasksKey, context.previous);
      }
    },
    onSuccess: (_data, input, context) => {
      // Read title/priority from the cache (unchanged by the toggle); `input`
      // only carries id/isCustom/completed.
      const tasks =
        queryClient.getQueryData<ChecklistTask[]>(
          context?.tasksKey ?? tasksKey,
        ) ?? [];
      const task = tasks.find(
        (t) => t.id === input.id && t.isCustom === input.isCustom,
      );
      if (!task) return;
      const props = {
        taskTitle: task.title,
        taskPriority: task.priority,
        source: task.isCustom ? "custom" : "sanity",
      };
      // `input.completed` is the pre-toggle state, so the new state is its negation.
      if (!input.completed) trackChecklistTaskCompleted(props);
      else trackChecklistTaskUncompleted(props);
    },
    // Settle against the server after success AND error.
    onSettled: () => queryClient.invalidateQueries({ queryKey: TASKS_KEY }),
  });
}

/**
 * Drag-to-reorder within a priority bucket (mirrors the mobile app, persisting to
 * the shared `checklist_task_order` table). The live drag is driven by @dnd-kit
 * local state in PrioritySection (reliable snap on release); this single
 * optimistic mutation runs on DROP — it writes the bucket's final order into the
 * cache and saves it, rolling back on failure.
 */
export function useReorderTasks() {
  const queryClient = useQueryClient();
  const tasksKey = useTasksKey();
  return useMutation<
    void,
    Error,
    { priority: Priority; bucket: ChecklistTask[] },
    { previous: ChecklistTask[] | undefined; tasksKey: readonly unknown[] }
  >({
    mutationFn: ({ priority, bucket }) =>
      checklist.saveChecklistOrder(priority, bucket.map(checklist.taskOrderKey)),
    onMutate: async ({ priority, bucket }) => {
      await queryClient.cancelQueries({ queryKey: TASKS_KEY });
      const previous = queryClient.getQueryData<ChecklistTask[]>(tasksKey);
      queryClient.setQueryData<ChecklistTask[]>(tasksKey, (prev) =>
        prev ? rebuildWithBucket(prev, priority, bucket) : prev,
      );
      // Mutation-time key — see useToggleTask.
      return { previous, tasksKey };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(context.tasksKey, context.previous);
      }
    },
    // Settle against the server after success AND error, matching the other
    // checklist mutations. After a save the refetch returns the same order;
    // after a rollback it reconciles the cache with the persisted order.
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
  const tasksKey = useTasksKey();
  return useMutation<
    void,
    Error,
    string,
    { previous: ChecklistTask[] | undefined; tasksKey: readonly unknown[] }
  >({
    mutationFn: checklist.deleteCustomTask,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: TASKS_KEY });
      const previous = queryClient.getQueryData<ChecklistTask[]>(tasksKey);
      queryClient.setQueryData<ChecklistTask[]>(tasksKey, (prev) =>
        prev
          ? prev.filter((task) => !(task.isCustom && task.id === id))
          : prev,
      );
      // Mutation-time key — see useToggleTask.
      return { previous, tasksKey };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(context.tasksKey, context.previous);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: TASKS_KEY }),
  });
}
