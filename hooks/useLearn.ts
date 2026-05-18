import { useQuery, useMutation } from "@tanstack/react-query";
import * as learn from "@/services/learn";

/** React Query hooks for Learn data (modules, lessons, progress). */

export function useModules() {
  return useQuery({ queryKey: ["modules"], queryFn: learn.getModules });
}

export function useModule(id: string) {
  return useQuery({
    queryKey: ["modules", id],
    queryFn: () => learn.getModuleById(id),
  });
}

export function useLearningProgress() {
  return useQuery({
    queryKey: ["learning-progress"],
    queryFn: learn.getLearningProgress,
  });
}

export function useToggleFavouriteModule() {
  return useMutation({ mutationFn: learn.toggleFavouriteModule });
}
