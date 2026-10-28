"use client";

import { useEffect, useState } from "react";
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
import { TaskProposalPanel } from "./TaskProposalPanel";
import { StepProposalPanel } from "./StepProposalPanel";
import { useStepProposal } from "@/hooks/useTaskActions";
import { TaskStatePanel, progressFor } from "./TaskStatePanel";
import { DetailProposalPanel, SavedDetailsPanel } from "./SavedDetails";
import { PlanPanel } from "../plans/PlanPanel";
import type { PlanTarget } from "../plans/PlanEntry";

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
  /** Open on the review of one task draft (#363) instead of a task. */
  proposalId?: string | null;
  /** Open on a settlement plan draft or saved plan (#364). */
  plan?: PlanTarget | null;
  /** A task row of the plan was opened (#364). */
  onOpenTask?: (taskRef: string) => void;
  /** #366: open on the review of suggested steps for one task. */
  stepProposalId?: string | null;
  /** #370: open on the review of one suggested detail. */
  detailProposalId?: string | null;
  /** #370: open on the saved details instead of the task list. */
  openDetails?: boolean;
  /** #365: the draft is a change to an existing task, not a new task. */
  proposalKind?: "task_create" | "task_edit";
}

/** The task list and task controls inside the direction B drawer. */
export function TaskActionsDrawer({
  open,
  onClose,
  surface,
  initialTaskId = null,
  proposalId = null,
  plan = null,
  onOpenTask,
  stepProposalId = null,
  detailProposalId = null,
  openDetails = false,
  proposalKind = "task_create",
}: TaskActionsDrawerProps) {
  const { t } = useTranslation();
  const { data: tasks = [], isLoading } = useTasks();
  const view = useTaskProgress();
  const store = useTaskActionStore(surface);
  const [selectedId, setSelectedId] = useState<string | null>(initialTaskId);
  // The task last opened from the list: focus returns to its row on Back.
  const [returnId, setReturnId] = useState<string | null>(null);
  // #370: the saved details view, opened from the list, a card or a review.
  const [showDetails, setShowDetails] = useState(openDetails);
  const [lastOpen, setLastOpen] = useState(open);
  const [lastInitialTaskId, setLastInitialTaskId] = useState(initialTaskId);
  if (open !== lastOpen || initialTaskId !== lastInitialTaskId) {
    setLastOpen(open);
    setLastInitialTaskId(initialTaskId);
    if (open) {
      setSelectedId(initialTaskId);
      setReturnId(null);
      setShowDetails(openDetails);
    }
  }

  // Progress may have changed elsewhere (Checklist completion, another
  // platform): read it again on every opening. Controls stay off until it arrives.
  const { refetch } = view;
  useEffect(() => {
    if (open) refetch();
  }, [open, initialTaskId, refetch]);

  const active = tasks.filter((task) => !task.dismissedAt);
  // A task removed in this drawer (#367) leaves the active list (a custom one every read);
  // its panel stays open on the removal receipt, with the ref and title it was opened with.
  const live = active.find((task) => task.id === selectedId) ?? null;
  const [seen, setSeen] = useState<{
    id: string;
    ref: string;
    title: string;
  } | null>(null);
  if (
    live &&
    (seen?.id !== live.id ||
      seen.ref !== taskOrderKey(live) ||
      seen.title !== live.title)
  )
    setSeen({ id: live.id, ref: taskOrderKey(live), title: live.title });
  const kept = !live && seen && seen.id === selectedId ? seen : null;
  const selected = live ?? (kept ? { title: kept.title } : null);
  const selectedRef = live ? taskOrderKey(live) : (kept?.ref ?? null);
  const phase = useTaskActionPhase(store, selectedRef);
  const draftId = proposalId ?? stepProposalId ?? detailProposalId;
  const draftPhase = useTaskActionPhase(
    store,
    draftId ? `proposal:${draftId}` : null,
  );
  const stepDraft = useStepProposal(stepProposalId);
  const stepTask = stepDraft.data
    ? (active.find(
        (task) => taskOrderKey(task) === stepDraft.data.operation.task_ref,
      ) ?? null)
    : null;

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
        showDetails
          ? t("savedDetails.title")
          : detailProposalId
            ? t("savedDetails.reviewTitle")
            : stepProposalId
              ? t("taskSteps.reviewTitle")
              : plan
                ? "proposalId" in plan
                  ? t("plans.reviewTitle")
                  : t("plans.planTitle")
                : proposalId
                  ? proposalKind === "task_edit"
                    ? t("taskEdit.drawerTitle")
                    : t("taskCreate.drawerTitle")
                  : selected
                    ? t("taskActions.drawerTitle")
                    : t("taskActions.listTitle")
      }
      onBack={
        showDetails && !openDetails && !detailProposalId
          ? () => setShowDetails(false)
          : selected && !initialTaskId && !proposalId && !stepProposalId && !plan
            ? () => setSelectedId(null)
            : undefined
      }
      closeOnEscape={phase.phase !== "saving" && draftPhase.phase !== "saving"}
    >
      {showDetails ? (
        view.status === "loading" ? (
          <p role="status" className="loading-delayed text-sm text-ink-muted">
            {t("taskActions.loading")}
          </p>
        ) : view.status === "signed_out" ? (
          <p className="text-sm text-ink-muted">{t("taskActions.signedOut")}</p>
        ) : view.status === "unavailable" ? (
          <p className="text-sm text-ink-muted">
            {t("taskActions.unavailable")}
          </p>
        ) : (
          <SavedDetailsPanel view={view} store={store} />
        )
      ) : detailProposalId ? (
        <DetailProposalPanel
          proposalId={detailProposalId}
          view={view}
          store={store}
          onViewDetails={() => setShowDetails(true)}
        />
      ) : stepProposalId ? (
        <StepProposalPanel
          proposalId={stepProposalId}
          view={view}
          store={store}
          taskTitle={stepTask?.title ?? null}
        />
      ) : plan ? (
        <PlanPanel target={plan} onOpenTask={(taskRef) => onOpenTask?.(taskRef)} />
      ) : proposalId ? (
        <TaskProposalPanel
          proposalId={proposalId}
          view={view}
          store={store}
          titleFor={(ref) =>
            active.find((task) => taskOrderKey(task) === ref)?.title ?? null
          }
        />
      ) : view.status === "loading" || isLoading ? (
        <p role="status" className="loading-delayed text-sm text-ink-muted">
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
              className="press-dim inline-flex min-h-11 cursor-pointer items-center gap-1 rounded text-sm font-semibold text-ink-secondary underline underline-offset-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {t("taskActions.openChecklist")}
              <ChevronRight className={cn("h-4 w-4", RTL_FLIP)} aria-hidden />
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {/* #370: the saved details, one row above the tasks. */}
          <button
            type="button"
            data-drawer-focus={returnId === "details" ? "" : undefined}
            onClick={() => {
              setShowDetails(true);
              setReturnId("details");
            }}
            className="press-dim flex min-h-12 w-full cursor-pointer items-center gap-3 rounded border-b border-border-card py-2.5 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span className="min-w-0 flex-1">
              <span className="block break-words text-sm font-medium text-ink-secondary">
                {t("savedDetails.entryTitle")}
              </span>
              <span className="mt-0.5 block text-xs text-ink-muted">
                {t("savedDetails.entryHint")}
              </span>
            </span>
            <ChevronRight
              className={cn("h-4 w-4 shrink-0 text-ink-placeholder", RTL_FLIP)}
              aria-hidden
            />
          </button>
          {sorted.length === 0 ? (
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
                      data-drawer-focus={task.id === returnId ? "" : undefined}
                      onClick={() => {
                        setSelectedId(task.id);
                        setReturnId(task.id);
                      }}
                      className="press-dim flex min-h-12 w-full cursor-pointer items-center gap-3 rounded py-2.5 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
        </div>
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
          <p
            className={cn(
              "truncate text-xs text-ink-muted",
              view.status === "loading" && "loading-delayed",
            )}
          >
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
          className="press inline-flex min-h-11 shrink-0 cursor-pointer items-center rounded-lg border border-border-card px-3 text-sm font-semibold text-ink-secondary hover:bg-surface-gray focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {t("taskActions.open")}
        </button>
      </div>
    </div>
  );
}
