import { useQuery, useMutation } from "@tanstack/react-query";
import * as checklist from "@/services/checklist";

/** React Query hooks for Checklist data. */

export function useTasks() {
  return useQuery({ queryKey: ["tasks"], queryFn: checklist.getTasks });
}

export function useToggleTask() {
  return useMutation({ mutationFn: checklist.toggleTask });
}

export function useAddCustomTask() {
  return useMutation({ mutationFn: checklist.addCustomTask });
}
