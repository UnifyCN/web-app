"use client";

import { createContext, useContext } from "react";
import type { TaskState } from "@/lib/companionActions/contract";
import type { ChecklistTask } from "@/types";

/** Saved task progress for Checklist rows (mobile-app#361). Absent when the feature is off. */
export interface TaskProgressRows {
  stateOf: (
    task: ChecklistTask,
  ) => { state: TaskState; waitingReason: string | null } | null;
  open: (task: ChecklistTask) => void;
}

export const TaskProgressRowsContext = createContext<TaskProgressRows | null>(
  null,
);
export const useTaskProgressRows = () => useContext(TaskProgressRowsContext);
