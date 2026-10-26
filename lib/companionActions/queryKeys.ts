/**
 * Root of every task-progress query (mobile-app#361). Each key carries the
 * account id. Kept apart from the hooks so Checklist mutations can refresh task
 * progress without an import cycle.
 */
export const TASK_PROGRESS_ROOT = "companion-task-actions" as const;
export const taskProgressKey = (userId: string | null) =>
  [TASK_PROGRESS_ROOT, userId] as const;
