"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import { cn, RTL_FLIP } from "@/lib/utils";
import { useTasks } from "@/hooks/useChecklist";
import { taskOrderKey } from "@/services/checklist";
import type { ChecklistTask } from "@/types";
import type { TaskState } from "@/lib/companionActions/contract";
import type { TaskActionSurface } from "@/lib/companionActions/analytics";
import {
  useTaskActionPhase,
  useTaskActionStore,
  useTaskProgress,
} from "@/hooks/useTaskActions";
import { TaskDrawer } from "./TaskDrawer";
import { TaskStatePanel, progressFor } from "./TaskStatePanel";

const STATE_ORDER: TaskState[] = [
  "in_progress",
  "waiting",
  "not_started",
  "completed",
];

interface TaskActionsDrawerProps {
  open: boolean;
  onClose: () => void;
  surface: TaskActionSurface;
  /** Open straight on one task (Checklist). Without it the drawer starts on the task list (Companion). */
  initialTaskId?: string | null;
}

/** The task list and task controls inside the direction B drawer. */
export function TaskActionsDrawer({
  open,
  onClose,
  surface,
  initialTaskId = null,
}: TaskActionsDrawerProps) {
  const { t } = useTranslation();
  const { data: tasks = [], isLoading } = useTasks();
  const view = useTaskProgress();
  const store = useTaskActionStore(surface);
  const [selectedId, setSelectedId] = useState<string | null>(initialTaskId);
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setSelectedId(initialTaskId);
  }

  const active = tasks.filter((task) => !task.dismissedAt);
  const selected = active.find((task) => task.id === selectedId) ?? null;
  const selectedRef = selected ? taskOrderKey(selected) : null;
  const phase = useTaskActionPhase(store, selectedRef);

  const stateOf = (task: ChecklistTask): TaskState =>
    progressFor(taskOrderKey(task), view).state;
  const sorted = [...active].sort(
    (a, b) => STATE_ORDER.indexOf(stateOf(a)) - STATE_ORDER.indexOf(stateOf(b)),
  );

  return (
    <TaskDrawer
      open={open}
      onClose={onClose}
      title={
        selected ? t("taskActions.drawerTitle") : t("taskActions.listTitle")
      }
      onBack={
        selected && !initialTaskId ? () => setSelectedId(null) : undefined
      }
      closeOnEscape={phase.phase !== "saving"}
    >
      {view.status === "loading" || isLoading ? (
        <p role="status" className="text-sm text-ink-muted">
          {t("taskActions.loading")}
        </p>
      ) : view.status === "signed_out" ? (
        <p className="text-sm text-ink-muted">{t("taskActions.signedOut")}</p>
      ) : view.status === "unavailable" ? (
        <p className="text-sm text-ink-muted">{t("taskActions.unavailable")}</p>
      ) : selected && selectedRef ? (
        <div className="space-y-6">
          <TaskStatePanel
            title={selected.title}
            taskRef={selectedRef}
            view={view}
            store={store}
          />
          {surface === "companion" && (
            <Link
              href="/checklist"
              className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary hover:text-primary-dark"
            >
              {t("taskActions.openChecklist")}
              <ChevronRight className={cn("h-4 w-4", RTL_FLIP)} aria-hidden />
            </Link>
          )}
        </div>
      ) : sorted.length === 0 ? (
        <p className="text-sm text-ink-muted">{t("taskActions.noTasks")}</p>
      ) : (
        <ul
          className="divide-y divide-border-card"
          aria-label={t("taskActions.listTitle")}
        >
          {sorted.map((task) => {
            const p = progressFor(taskOrderKey(task), view);
            return (
              <li key={`${task.isCustom ? "c" : "s"}-${task.id}`}>
                <button
                  type="button"
                  onClick={() => setSelectedId(task.id)}
                  className="flex min-h-12 w-full cursor-pointer items-center gap-3 py-2.5 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm font-medium text-ink-secondary">
                      {task.title}
                    </span>
                    <span className="mt-0.5 block text-xs text-ink-muted">
                      {t(`taskActions.state.${p.state}`)}
                    </span>
                  </span>
                  <ChevronRight
                    className={cn(
                      "h-4 w-4 shrink-0 text-ink-placeholder",
                      RTL_FLIP,
                    )}
                    aria-hidden
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </TaskDrawer>
  );
}

/** Compact Companion entry to the user's saved task progress (outside old messages). */
export function CompanionTasksEntry({ onOpen }: { onOpen: () => void }) {
  const { t } = useTranslation();
  const view = useTaskProgress();
  if (view.status === "unavailable" || view.status === "signed_out")
    return null;
  let inProgress = 0;
  let waiting = 0;
  for (const p of view.byRef.values()) {
    if (p.removed) continue;
    if (p.state === "in_progress") inProgress++;
    if (p.state === "waiting") waiting++;
  }
  return (
    <div className="border-b border-border-card px-4 py-2 md:px-6">
      <div className="mx-auto flex w-full max-w-3xl items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink-secondary">
            {t("taskActions.entryTitle")}
          </p>
          <p className="truncate text-xs text-ink-muted">
            {view.status === "loading"
              ? t("taskActions.loading")
              : t("taskActions.entrySummary", {
                  inProgressCount: inProgress,
                  waitingCount: waiting,
                })}
          </p>
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex min-h-11 shrink-0 cursor-pointer items-center rounded-lg border border-border-card px-3 text-sm font-semibold text-ink-secondary hover:bg-surface-gray focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {t("taskActions.open")}
        </button>
      </div>
    </div>
  );
}
