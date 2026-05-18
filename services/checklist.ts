import type { ChecklistTask, Priority } from "@/types";
import { tasks } from "@/lib/mock/tasks";

/**
 * Checklist data access.
 * TODO: replace with real data — query Supabase (`user_tasks`,
 * `custom_checklist_tasks`).
 */

export async function getTasks(): Promise<ChecklistTask[]> {
  return tasks;
}

export async function toggleTask(taskId: string): Promise<void> {
  // TODO: replace with real data — update `completed` on the task row.
  void taskId;
}

export interface CustomTaskInput {
  title: string;
  description: string;
  priority: Priority;
}

export async function addCustomTask(input: CustomTaskInput): Promise<void> {
  // TODO: replace with real data — insert into `custom_checklist_tasks`.
  void input;
}
