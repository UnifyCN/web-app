import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as checklist from "@/services/checklist";

/** React Query hooks for Checklist data. */

const TASKS_KEY = ["tasks"] as const;

export function useTasks() {
  return useQuery({ queryKey: TASKS_KEY, queryFn: checklist.getTasks });
}

export function useToggleTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: checklist.toggleTask,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TASKS_KEY }),
  });
}

export function useAddCustomTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: checklist.addCustomTask,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TASKS_KEY }),
  });
}
