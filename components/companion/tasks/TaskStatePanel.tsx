"use client";

import { useId, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import {
  CheckCircle2,
  Circle,
  CircleDot,
  Hourglass,
  WifiOff,
} from "lucide-react";
import { ReceiptBlock } from "./ReceiptBlock";
import { TaskStepsSection } from "./TaskStepsSection";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import {
  TASK_STATES,
  WAITING_REASON_MAX,
  isRemoval,
  setStateOperation,
  type TaskProgress,
  type TaskReceipt,
  type TaskState,
} from "@/lib/companionActions/contract";
import {
  isUnresolved,
  type TaskActionStore,
} from "@/lib/companionActions/taskActionStore";
import {
  useTaskActionPhase,
  type TaskProgressView,
} from "@/hooks/useTaskActions";

const STATE_ICON: Record<TaskState, typeof Circle> = {
  not_started: Circle,
  in_progress: CircleDot,
  waiting: Hourglass,
  completed: CheckCircle2,
};

/** Saved progress, or for a content-backed task never written: Not started at revision 0. */
export function progressFor(
  taskRef: string,
  view: TaskProgressView,
): TaskProgress {
  return (
    view.byRef.get(taskRef) ?? {
      taskRef,
      state: "not_started",
      waitingReason: null,
      revision: 0,
      // A custom task always has a saved row; missing means it was deleted elsewhere.
      removed: taskRef.startsWith("custom:") && view.status === "ready",
      lastReceipt: null,
    }
  );
}

function useDraft(store: TaskActionStore | null, taskRef: string) {
  return useSyncExternalStore(
    store?.subscribe ?? (() => () => {}),
    () => store?.draft(taskRef),
    () => undefined,
  );
}

interface TaskStatePanelProps {
  title: string;
  taskRef: string;
  view: TaskProgressView;
  store: TaskActionStore | null;
}

/**
 * Explicit controls for one existing Checklist task (mobile-app#361): the four
 * states, an editable waiting reason, the exact saved receipt with Undo for that
 * receipt only, and every unresolved outcome. Since #366 also the task's steps.
 * Shared by the Checklist and Companion drawers; both read the same saved record.
 */
export function TaskStatePanel({
  title,
  taskRef,
  view,
  store,
}: TaskStatePanelProps) {
  const { t } = useTranslation();
  const ids = useId();
  const phase = useTaskActionPhase(store, taskRef);
  const progress = progressFor(taskRef, view);
  const draft = useDraft(store, taskRef);
  const reasonValue = draft ?? progress.waitingReason ?? "";
  const busy = isUnresolved(phase);
  // Every write, including a retry or an approved compensating change, needs a
  // connection and a fresh read; offline nothing is sent or queued.
  const writable = Boolean(store) && view.canWrite && !progress.removed;
  const canWrite = writable && !busy;
  const stateLabel = (s: TaskState) => t(`taskActions.state.${s}`);

  function choose(next: TaskState) {
    if (!canWrite || !store || next === progress.state) return;
    void store.setState(
      setStateOperation(
        progress,
        next,
        next === "waiting" ? reasonValue : undefined,
      ),
    );
  }

  function saveReason() {
    if (!canWrite || !store || progress.state !== "waiting") return;
    // Keep the typed reason unless this exact save is confirmed applied: a
    // refused, unknown or unsaved result must not replace it, and text typed
    // while the save was in flight is newer than the saved reason.
    const submitted = reasonValue;
    void store
      .setState(setStateOperation(progress, "waiting", submitted))
      .then(() => {
        if (
          store.get(taskRef).phase === "saved" &&
          (store.draft(taskRef) ?? submitted) === submitted
        )
          store.setDraft(taskRef, undefined);
      });
  }

  const receipt: TaskReceipt | null =
    phase.phase === "saved"
      ? {
          ...phase.receipt,
          current:
            phase.receipt.current &&
            progress.revision === phase.receipt.afterRevision,
        }
      : progress.lastReceipt;
  const reasonChanged = reasonValue.trim() !== (progress.waitingReason ?? "");

  return (
    <section aria-labelledby={`${ids}-title`} className="space-y-5">
      <header>
        <p className="text-xs font-medium text-ink-muted">
          {t("taskActions.existingTask")}
        </p>
        {/* Where focus goes when the control that had it is replaced. */}
        <h3
          id={`${ids}-title`}
          tabIndex={-1}
          data-drawer-focus=""
          className="mt-0.5 break-words text-lg font-semibold text-ink-secondary focus-visible:outline-none"
        >
          {title}
        </h3>
      </header>

      {view.stale && (
        <p className="flex items-start gap-2 rounded-lg bg-surface-card px-3 py-2 text-sm text-ink-tertiary">
          <WifiOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {t("taskActions.offline")}
        </p>
      )}
      {progress.removed && (
        <p className="rounded-lg bg-surface-card px-3 py-2 text-sm text-ink-tertiary">
          {t("taskActions.removed")}
        </p>
      )}

      <TaskStepsSection
        taskRef={taskRef}
        progress={progress}
        view={view}
        store={store}
        writable={writable}
      />

      <fieldset>
        <legend className="text-sm font-semibold text-ink-secondary">
          {t("taskActions.stateLabel")}
        </legend>
        <div
          role="radiogroup"
          aria-label={t("taskActions.stateLabel")}
          className="mt-2 grid grid-cols-2 gap-2"
        >
          {TASK_STATES.map((s) => {
            const Icon = STATE_ICON[s];
            const selected = progress.state === s;
            return (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-disabled={!canWrite}
                onClick={() => choose(s)}
                className={cn(
                  "flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-start text-sm font-medium",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                  selected
                    ? "border-primary bg-primary-bg text-ink-secondary"
                    : "border-border-card bg-surface text-ink-tertiary hover:bg-surface-gray",
                  canWrite
                    ? "press cursor-pointer"
                    : "cursor-not-allowed opacity-70",
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0",
                    selected ? "text-primary" : "text-ink-placeholder",
                  )}
                  aria-hidden
                />
                <span className="min-w-0 break-words">{stateLabel(s)}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          {t("taskActions.completedHint")}
        </p>
      </fieldset>

      {progress.state === "waiting" && (
        <div>
          <label
            htmlFor={`${ids}-reason`}
            className="text-sm font-semibold text-ink-secondary"
          >
            {t("taskActions.waitingLabel")}
          </label>
          <textarea
            id={`${ids}-reason`}
            rows={2}
            maxLength={WAITING_REASON_MAX}
            value={reasonValue}
            onChange={(e) => store?.setDraft(taskRef, e.target.value)}
            placeholder={t("taskActions.waitingPlaceholder")}
            className="mt-1.5 w-full resize-y rounded-lg border border-border-card bg-surface px-3 py-2 text-base text-ink-secondary placeholder:text-ink-placeholder focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-xs text-ink-muted">
              {t("taskActions.charactersLeft", {
                remaining: WAITING_REASON_MAX - reasonValue.length,
              })}
            </span>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              aria-disabled={!canWrite || !reasonChanged}
              onClick={() => reasonChanged && saveReason()}
              className={cn(
                (!canWrite || !reasonChanged) &&
                  "cursor-not-allowed opacity-60",
              )}
            >
              {t("taskActions.saveReason")}
            </Button>
          </div>
        </div>
      )}

      <div aria-live="polite" role="status" className="space-y-3">
        <PhaseMessage
          writable={writable}
          phase={phase.phase}
          stateLabel={stateLabel}
          store={store}
          taskRef={taskRef}
          phaseValue={phase}
        />
        {receipt && phase.phase !== "undo_review" && (
          <ReceiptBlock
            receipt={receipt}
            storeKey={taskRef}
            store={store}
            canWrite={canWrite}
          />
        )}
      </div>
    </section>
  );
}

/** The visible outcome of the last write of one store key (task, draft or command). */
export function PhaseMessage({
  writable,
  phase,
  phaseValue,
  stateLabel,
  store,
  taskRef,
}: {
  writable: boolean;
  phase: string;
  phaseValue: ReturnType<typeof useTaskActionPhase>;
  stateLabel: (s: TaskState) => string;
  store: TaskActionStore | null;
  taskRef: string;
}) {
  const { t } = useTranslation();
  const line = (text: string, tone: "neutral" | "error" = "neutral") => (
    <p
      key={phase}
      className={cn(
        "text-sm",
        tone === "error" ? "text-destructive-label" : "text-ink-tertiary",
        (phase === "saving" || phase === "checking") && "loading-delayed",
      )}
    >
      {text}
    </p>
  );
  switch (phase) {
    case "saving":
      return line(t("taskActions.saving"));
    case "checking":
      return line(t("taskActions.checking"));
    case "saved":
      return line(t("taskActions.saved"));
    case "refused":
      return line(
        phaseValue.phase === "refused" && phaseValue.reason === "task_removed"
          ? t("taskActions.removed")
          : t("taskActions.refused"),
        "error",
      );
    case "conflict":
      return line(t("taskActions.conflict"), "error");
    case "already_undone":
      return line(t("taskActions.alreadyUndone"));
    case "command_used":
      return line(t("taskCreate.commandUsed"));
    case "needs_clarification":
      return line(t("taskCreate.needsClarification"), "error");
    case "signed_out":
      return line(t("taskActions.signedOut"), "error");
    case "unavailable":
      return line(t("taskActions.unavailable"), "error");
    case "pending":
    case "lookup_failed":
      return (
        <div className="space-y-2">
          {line(
            t(
              phase === "pending"
                ? "taskActions.pending"
                : "taskActions.lookupFailed",
            ),
            "error",
          )}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => void store?.checkAgain(taskRef)}
          >
            {t("taskActions.checkAgain")}
          </Button>
        </div>
      );
    case "not_applied":
      return (
        <div className="space-y-2">
          {line(t("taskActions.notApplied"), "error")}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            aria-disabled={!writable}
            onClick={() => writable && void store?.retry(taskRef)}
            className={cn(!writable && "cursor-not-allowed opacity-60")}
          >
            {t("taskActions.retry")}
          </Button>
        </div>
      );
    case "undo_review": {
      if (phaseValue.phase !== "undo_review") return null;
      const proposed = phaseValue.proposal.operations[0];
      if (proposed.type.startsWith("step.")) {
        // #366: Undo of a step change met a newer edit. Nothing changed; the offered
        // change needs approval, and a removal also its confirmation (this button).
        const removes = isRemoval(proposed);
        return (
          <div className="rounded-lg border border-primary-subtle bg-primary-bg px-3 py-3">
            <p className="text-sm text-ink-secondary">
              {removes
                ? t("taskSteps.undoConflictRemove")
                : t("taskSteps.undoConflict")}
            </p>
            {proposed.type === "step.update" && (
              <p className="mt-2 whitespace-pre-wrap break-words text-sm text-ink-secondary">
                {t("taskSteps.proposedText", { title: proposed.title })}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                aria-disabled={!writable}
                className={cn(
                  "bg-ink-secondary hover:bg-ink",
                  !writable && "cursor-not-allowed opacity-60",
                )}
                onClick={() =>
                  writable &&
                  void store?.approveCompensation(taskRef, {
                    removalConfirmed: removes,
                  })
                }
              >
                {removes
                  ? t("taskSteps.remove")
                  : t("taskActions.applyCompensating")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => store?.dismiss(taskRef)}
              >
                {t("taskActions.keepCurrent")}
              </Button>
            </div>
          </div>
        );
      }
      if (proposed.type === "task.remove_created") {
        // Undo of an added task met a newer edit: nothing was removed. Removing it
        // now is a reviewed change; this button is the user's confirmation.
        return (
          <div className="rounded-lg border border-primary-subtle bg-primary-bg px-3 py-3">
            <p className="text-sm text-ink-secondary">
              {t("taskCreate.undoConflict")}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                aria-disabled={!writable}
                className={cn(
                  "bg-ink-secondary hover:bg-ink",
                  !writable && "cursor-not-allowed opacity-60",
                )}
                onClick={() =>
                  writable &&
                  void store?.approveCompensation(taskRef, {
                    removalConfirmed: true,
                  })
                }
              >
                {t("taskCreate.removeAnyway")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => store?.dismiss(taskRef)}
              >
                {t("taskCreate.keep")}
              </Button>
            </div>
          </div>
        );
      }
      if (proposed.type !== "task.set_state") return null;
      return (
        <div className="rounded-lg border border-primary-subtle bg-primary-bg px-3 py-3">
          <p className="text-sm font-semibold text-ink-secondary">
            {t("taskActions.undoConflictTitle")}
          </p>
          <p className="mt-1 text-sm text-ink-tertiary">
            {t("taskActions.undoConflictBody", {
              current: phaseValue.current
                ? stateLabel(phaseValue.current.state)
                : "-",
              proposed: stateLabel(proposed.state),
            })}
          </p>
          {proposed.waiting_reason && (
            <p className="mt-1 break-words text-sm text-ink-tertiary">
              {t("taskActions.waitingFor", { reason: proposed.waiting_reason })}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {/* Dark fill as in the reviewed prototype: white on the brand
                orange is below 4.5:1. */}
            <Button
              type="button"
              size="sm"
              aria-disabled={!writable}
              className={cn(
                "bg-ink-secondary hover:bg-ink",
                !writable && "cursor-not-allowed opacity-60",
              )}
              onClick={() =>
                writable && void store?.approveCompensation(taskRef)
              }
            >
              {t("taskActions.applyCompensating")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => store?.dismiss(taskRef)}
            >
              {t("taskActions.keepCurrent")}
            </Button>
          </div>
        </div>
      );
    }
    default:
      return null;
  }
}
