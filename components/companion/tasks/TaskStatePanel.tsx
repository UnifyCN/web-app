"use client";

import { useId, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import {
  CheckCircle2,
  Circle,
  CircleDot,
  Hourglass,
  Undo2,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import {
  TASK_STATES,
  WAITING_REASON_MAX,
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
 * receipt only, and every unresolved outcome. Shared by the Checklist and
 * Companion drawers; both read the same saved record.
 */
export function TaskStatePanel({
  title,
  taskRef,
  view,
  store,
}: TaskStatePanelProps) {
  const { t, i18n } = useTranslation();
  const ids = useId();
  const phase = useTaskActionPhase(store, taskRef);
  const progress = progressFor(taskRef, view);
  const draft = useDraft(store, taskRef);
  const reasonValue = draft ?? progress.waitingReason ?? "";
  const busy = isUnresolved(phase);
  const canWrite =
    Boolean(store) && view.canWrite && !progress.removed && !busy;
  const stateLabel = (s: TaskState) => t(`taskActions.state.${s}`);

  const formatTime = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));

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
    void store
      .setState(setStateOperation(progress, "waiting", reasonValue))
      .then(() => store.setDraft(taskRef, undefined));
  }

  // The result of this panel's last save stays on screen, but it stops reading as
  // current once the saved task moves past the revision it produced (a newer
  // change here or on another platform). Its Undo still names this receipt only.
  // A reason-only save keeps the state: name what changed instead of
  // "Waiting to Waiting".
  const receiptText = (r: TaskReceipt) =>
    r.kind === "undo"
      ? t("taskActions.receiptUndo", { state: stateLabel(r.afterState) })
      : r.beforeState === "waiting" && r.afterState === "waiting"
        ? t("taskActions.receiptReason")
        : t("taskActions.receiptChange", {
            from: stateLabel(r.beforeState),
            to: stateLabel(r.afterState),
          });

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
        <h3
          id={`${ids}-title`}
          className="mt-0.5 break-words text-lg font-semibold text-ink-secondary"
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
                  "flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-start text-sm font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                  selected
                    ? "border-primary bg-primary-bg text-ink-secondary"
                    : "border-border-card bg-surface text-ink-tertiary hover:bg-surface-gray",
                  !canWrite && "cursor-not-allowed opacity-70",
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
            <span className="text-xs text-ink-placeholder">
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
          phase={phase.phase}
          stateLabel={stateLabel}
          store={store}
          taskRef={taskRef}
          phaseValue={phase}
        />
        {receipt && phase.phase !== "undo_review" && (
          <div className="rounded-lg border border-border-card bg-surface-card px-3 py-2.5">
            <p className="text-sm text-ink-secondary">{receiptText(receipt)}</p>
            <p className="mt-0.5 text-xs text-ink-muted">
              {formatTime(receipt.createdAt)}
              {!receipt.current && ` · ${t("taskActions.receiptHistorical")}`}
            </p>
            {receipt.undoable && (
              <button
                type="button"
                aria-disabled={!canWrite}
                onClick={() =>
                  canWrite &&
                  store &&
                  void store.undo(taskRef, receipt.operationId)
                }
                className={cn(
                  "mt-1.5 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary-dark",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded",
                  !canWrite && "cursor-not-allowed opacity-60",
                )}
              >
                <Undo2 className="h-4 w-4" aria-hidden />
                {t("taskActions.undo")}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function PhaseMessage({
  phase,
  phaseValue,
  stateLabel,
  store,
  taskRef,
}: {
  phase: string;
  phaseValue: ReturnType<typeof useTaskActionPhase>;
  stateLabel: (s: TaskState) => string;
  store: TaskActionStore | null;
  taskRef: string;
}) {
  const { t } = useTranslation();
  const line = (text: string, tone: "neutral" | "error" = "neutral") => (
    <p
      className={cn(
        "text-sm",
        tone === "error" ? "text-destructive-label" : "text-ink-tertiary",
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
            onClick={() => void store?.retry(taskRef)}
          >
            {t("taskActions.retry")}
          </Button>
        </div>
      );
    case "undo_review": {
      if (phaseValue.phase !== "undo_review") return null;
      const proposed = phaseValue.proposal.operations[0];
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
            <Button
              type="button"
              size="sm"
              onClick={() => void store?.approveCompensation(taskRef)}
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
