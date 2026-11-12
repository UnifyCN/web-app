import type { LessonProgressRow } from "./progress";

/** Lesson ids the user has completed, and those they have started. */
export function progressSets(rows: readonly LessonProgressRow[]) {
  const completed = new Set<string>();
  const started = new Set<string>();
  for (const r of rows) {
    if (r.is_completed) completed.add(r.sanity_lesson_id);
    if (r.is_completed || r.is_in_progress || (r.completed_pages ?? 0) > 0) {
      started.add(r.sanity_lesson_id);
    }
  }
  return { completed, started };
}

export type LessonState = "done" | "next" | "todo";

/**
 * Each lesson's state in a module (Figma 160:1021, mobile submodule screen):
 * completed lessons are done; the first unfinished one is "up next"; the rest
 * are to do. Lessons can still be opened in any order.
 */
export function lessonStates(
  lessonIds: readonly string[],
  completed: ReadonlySet<string>,
): LessonState[] {
  let nextGiven = false;
  return lessonIds.map((id) => {
    if (completed.has(id)) return "done";
    if (!nextGiven) {
      nextGiven = true;
      return "next";
    }
    return "todo";
  });
}
