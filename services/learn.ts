import type { LearnModule, LearningProgressSummary } from "@/types";
import { modules, getModuleById as findModule } from "@/lib/mock/modules";
import { learningProgress } from "@/lib/mock/progress";

/**
 * Learn data access (modules, lessons, progress).
 * TODO: replace with real data — Sanity for module/lesson content, Supabase
 * (`learn_progress`, `user_lesson_progress`) for progress.
 */

export async function getModules(): Promise<LearnModule[]> {
  return modules;
}

export async function getModuleById(
  id: string,
): Promise<LearnModule | undefined> {
  return findModule(id);
}

export async function getLearningProgress(): Promise<
  LearningProgressSummary[]
> {
  return learningProgress;
}

export async function toggleFavouriteModule(moduleId: string): Promise<void> {
  // TODO: replace with real data — toggle the favourite flag for this module.
  void moduleId;
}
