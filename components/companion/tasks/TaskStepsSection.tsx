"use client";

import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Trash2 } from "lucide-react";
import { ReceiptBlock } from "./ReceiptBlock";
import { PhaseMessage } from "./TaskStatePanel";
import { Button } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { cn } from "@/lib/utils";
import {
  STEP_TITLE_MAX,
  setStateOperation,
  stepCreateOperation,
  stepDoneOperation,
  stepRemoveOperation,
  stepUpdateOperation,
  type TaskProgress,
  type TaskState,
  type TaskStep,
} from "@/lib/companionActions/contract";
import {
  isUnresolved,
  type TaskActionStore,
} from "@/lib/companionActions/taskActionStore";
import {
  stepsFor,
  useTaskActionDraft,
  useTaskActionPhase,
  type TaskProgressView,
} from "@/hooks/useTaskActions";

/** Store keys: the task's own step list (add, remove) and one step (check, rename). */
export const stepsKey = (taskRef: string) => `steps:${taskRef}`;
export const stepKey = (stepId: string) => `step:${stepId}`;
const newStepDraftKey = (taskRef: string) => `step-new:${taskRef}`;
const editDraftKey = (stepId: string) => `step-edit:${stepId}`;

const iconButton = cn(
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-muted",
  "hover:bg-surface-gray hover:text-ink-secondary",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
);

/**
 * One level of tracked steps under one Checklist task (mobile-app#366). Each control
 * authorizes exactly its own change: check, add the typed step, rename, or remove
 * after confirmation. Checking every step never completes the task; it offers an
 * explicit completion instead. A completed task keeps its steps as they were.
 * Rows are keyed by step id, so the focused checkbox stays the same element through
 * its save and the re-read. Typed text lives in the action store.
 */
export function TaskStepsSection({
  taskRef,
  progress,
  view,
  store,
  writable,
}: {
  taskRef: string;
  progress: TaskProgress;
  view: TaskProgressView;
  store: TaskActionStore | null;
  /** A connection, a fresh read and a live task. */
  writable: boolean;
}) {
  const { t } = useTranslation();
  const ids = useId();
  const steps = stepsFor(taskRef, view);
  const listPhase = useTaskActionPhase(store, stepsKey(taskRef));
  const taskPhase = useTaskActionPhase(store, taskRef);
  const newStep = useTaskActionDraft(store, newStepDraftKey(taskRef)) ?? "";
  const done = steps.filter((s) => s.done).length;
  const completed = progress.state === "completed";
  const canEdit = writable && !completed;
  const failedAdd =
    listPhase.phase === "not_applied" &&
    listPhase.write.kind === "apply" &&
    listPhase.write.operation?.type === "step.create"
      ? listPhase.write.operation
      : null;
  const changedAdd =
    failedAdd?.titles.length === 1 && newStep.trim() !== failedAdd.titles[0];
  const canAdd =
    canEdit &&
    (!isUnresolved(listPhase) || changedAdd) &&
    newStep.trim().length > 0;
  const allDone = steps.length > 0 && done === steps.length;
  const canComplete = canEdit && !isUnresolved(taskPhase);
  const stateLabel = (s: TaskState) => t(`taskActions.state.${s}`);

  function add() {
    if (!canAdd || !store) return;
    const submitted = newStep;
    if (changedAdd) store.supersedeNotApplied(stepsKey(taskRef));
    void store
      .applyOperation(
        stepsKey(taskRef),
        stepCreateOperation(taskRef, submitted),
        { kind: "ui_control" },
      )
      .then(() => {
        // Clear only the text that was saved, never a newer one typed meanwhile.
        if (
          store.get(stepsKey(taskRef)).phase === "saved" &&
          (store.draft(newStepDraftKey(taskRef)) ?? submitted) === submitted
        )
          store.setDraft(newStepDraftKey(taskRef), undefined);
      });
  }

  return (
    <section aria-labelledby={`${ids}-steps`} className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4
          id={`${ids}-steps`}
          className="text-sm font-semibold text-ink-secondary"
        >
          {t("taskSteps.title")}
        </h4>
        {steps.length > 0 && (
          <span className="text-xs text-ink-tertiary">
            {t("taskSteps.count", { done, total: steps.length })}
          </span>
        )}
      </div>
      <p className="text-xs text-ink-muted">
        {completed && steps.length > 0
          ? t("taskSteps.completedSummary", { done, total: steps.length })
          : t("taskSteps.hint")}
      </p>
      {steps.length === 0 && !completed && (
        <p className="text-xs text-ink-muted">{t("taskSteps.empty")}</p>
      )}

      {steps.length > 0 && (
        <ul className="divide-y divide-border-card">
          {steps.map((step) => (
            <StepRow
              key={step.stepId}
              step={step}
              store={store}
              canEdit={canEdit}
              taskRef={taskRef}
            />
          ))}
        </ul>
      )}

      {allDone && !completed && (
        <div className="rounded-lg border border-primary-subtle bg-primary-bg px-3 py-3">
          <p className="text-sm text-ink-secondary">
            {t("taskSteps.allDone", { state: stateLabel(progress.state) })}
          </p>
          <Button
            type="button"
            size="sm"
            aria-disabled={!canComplete}
            onClick={() =>
              canComplete &&
              store &&
              void store.setState(setStateOperation(progress, "completed"))
            }
            className={cn(
              "mt-3 bg-ink-secondary hover:bg-ink",
              !canComplete && "cursor-not-allowed opacity-60",
            )}
          >
            {t("taskSteps.markComplete")}
          </Button>
        </div>
      )}

      {!completed && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <input
            type="text"
            aria-label={t("taskSteps.newStepLabel")}
            value={newStep}
            maxLength={STEP_TITLE_MAX}
            onChange={(e) =>
              store?.setDraft(newStepDraftKey(taskRef), e.target.value)
            }
            placeholder={t("taskSteps.newStepPlaceholder")}
            className="min-h-11 min-w-0 flex-1 basis-48 rounded-lg border border-border-card bg-surface px-3 py-2 text-base text-ink-secondary placeholder:text-ink-placeholder focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
          <Button
            type="submit"
            size="sm"
            variant="secondary"
            aria-disabled={!canAdd}
            className={cn(!canAdd && "cursor-not-allowed opacity-60")}
          >
            {t("taskSteps.add")}
          </Button>
        </form>
      )}

      <div aria-live="polite" role="status" className="space-y-2">
        <StepPhase
          store={store}
          storeKey={stepsKey(taskRef)}
          writable={canEdit}
          draft={newStep}
          steps={steps}
        />
      </div>
    </section>
  );
}

function StepRow({
  step,
  store,
  canEdit,
  taskRef,
}: {
  step: TaskStep;
  store: TaskActionStore | null;
  canEdit: boolean;
  taskRef: string;
}) {
  const { t } = useTranslation();
  const ids = useId();
  const phase = useTaskActionPhase(store, stepKey(step.stepId));
  const listPhase = useTaskActionPhase(store, stepsKey(taskRef));
  const edit = useTaskActionDraft(store, editDraftKey(step.stepId));
  const [confirming, setConfirming] = useState(false);
  const [instantEdit, setInstantEdit] = useState(false);
  const [instantConfirm, setInstantConfirm] = useState(false);
  const canWrite = canEdit && !isUnresolved(phase);
  const editing = edit !== undefined;
  const editChanged =
    editing && edit.trim().length > 0 && edit.trim() !== step.title;
  const failedUpdate =
    phase.phase === "not_applied" &&
    phase.write.kind === "apply" &&
    phase.write.operation?.type === "step.update"
      ? phase.write.operation
      : null;
  const changedUpdate =
    failedUpdate !== null &&
    edit !== undefined &&
    edit.trim() !== failedUpdate.title;
  const canSaveEdit =
    canEdit && editChanged && (!isUnresolved(phase) || changedUpdate);

  function toggle() {
    if (!canWrite || !store) return;
    void store.applyOperation(
      stepKey(step.stepId),
      stepDoneOperation(step, !step.done),
      { kind: "ui_control" },
    );
  }

  function saveEdit() {
    if (!canSaveEdit || !store || edit === undefined) return;
    const submitted = edit;
    if (changedUpdate) store.supersedeNotApplied(stepKey(step.stepId));
    void store
      .applyOperation(
        stepKey(step.stepId),
        stepUpdateOperation(step, submitted),
        { kind: "ui_control" },
      )
      .then(() => {
        if (
          store.get(stepKey(step.stepId)).phase === "saved" &&
          store.draft(editDraftKey(step.stepId)) === submitted
        )
          store.setDraft(editDraftKey(step.stepId), undefined);
      });
  }

  function remove() {
    if (!canWrite || !store || isUnresolved(listPhase)) return;
    setConfirming(false);
    // The removal's result and its Undo belong to the step list: the row goes.
    void store.applyOperation(stepsKey(taskRef), stepRemoveOperation(step), {
      kind: "ui_control",
      removal_confirmed: true,
    });
  }

  return (
    <li className="py-1">
      <div className="flex items-center gap-1">
        <label
          htmlFor={`${ids}-check`}
          className={cn(
            "flex min-h-11 min-w-0 flex-1 items-center gap-3 py-1",
            canWrite ? "press-dim cursor-pointer" : "cursor-not-allowed",
          )}
        >
          <input
            id={`${ids}-check`}
            type="checkbox"
            checked={step.done}
            aria-disabled={!canWrite}
            onChange={(e) => {
              // Unavailable: keep the saved value; nothing is sent.
              if (!canWrite) {
                e.preventDefault();
                return;
              }
              toggle();
            }}
            className="h-5 w-5 shrink-0 accent-ink-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          />
          <span
            className={cn(
              "min-w-0 break-words text-base",
              step.done || !canEdit
                ? "text-ink-tertiary"
                : "text-ink-secondary",
            )}
          >
            {step.title}
          </span>
        </label>
        {canEdit && !editing && (
          <>
            <button
              type="button"
              aria-label={t("taskSteps.editA11y", { title: step.title })}
              aria-disabled={!canWrite}
              onClick={(event) => {
                if (!canWrite) return;
                setInstantEdit(event.detail === 0);
                store?.setDraft(editDraftKey(step.stepId), step.title);
              }}
              className={cn(
                iconButton,
                canWrite
                  ? "press cursor-pointer"
                  : "cursor-not-allowed opacity-60",
              )}
            >
              <Pencil className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              aria-label={t("taskSteps.removeA11y", { title: step.title })}
              aria-disabled={!canWrite}
              onClick={(event) => {
                if (!canWrite) return;
                setInstantConfirm(event.detail === 0);
                setConfirming(true);
              }}
              className={cn(
                iconButton,
                canWrite
                  ? "press cursor-pointer"
                  : "cursor-not-allowed opacity-60",
              )}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          </>
        )}
      </div>

      <Reveal open={editing} instant={instantEdit} className="space-y-2 pb-2">
        <input
          type="text"
          aria-label={t("taskSteps.editLabel")}
          value={edit}
          maxLength={STEP_TITLE_MAX}
          onChange={(e) =>
            store?.setDraft(editDraftKey(step.stepId), e.target.value)
          }
          className="min-h-11 w-full rounded-lg border border-border-card bg-surface px-3 py-2 text-base text-ink-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            aria-disabled={!canSaveEdit}
            onClick={saveEdit}
            className={cn(!canSaveEdit && "cursor-not-allowed opacity-60")}
          >
            {t("taskSteps.save")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() =>
              store?.setDraft(editDraftKey(step.stepId), undefined)
            }
          >
            {t("taskSteps.cancelEdit")}
          </Button>
        </div>
      </Reveal>

      <Reveal
        open={confirming}
        instant={instantConfirm}
        className="mb-2 rounded-lg border border-primary-subtle bg-primary-bg px-3 py-3"
      >
        <p className="break-words text-sm font-semibold text-ink-secondary">
          {t("taskSteps.confirmRemove", { title: step.title })}
        </p>
        <p className="mt-1 text-sm text-ink-tertiary">
          {t("taskSteps.confirmRemoveBody")}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            aria-disabled={!canWrite}
            onClick={remove}
            className={cn(
              "bg-ink-secondary hover:bg-ink",
              !canWrite && "cursor-not-allowed opacity-60",
            )}
          >
            {t("taskSteps.remove")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setConfirming(false)}
          >
            {t("taskSteps.keep")}
          </Button>
        </div>
      </Reveal>

      <div aria-live="polite" role="status" className="space-y-2">
        <StepPhase
          store={store}
          storeKey={stepKey(step.stepId)}
          writable={canEdit}
          draft={edit}
          steps={[step]}
        />
      </div>
    </li>
  );
}

/** The outcome of the last step write of one key, and its receipt with Undo. */
function StepPhase({
  store,
  storeKey,
  writable,
  draft,
  steps,
}: {
  store: TaskActionStore | null;
  storeKey: string;
  writable: boolean;
  draft?: string;
  steps: readonly TaskStep[];
}) {
  const { t } = useTranslation();
  const phase = useTaskActionPhase(store, storeKey);
  const receipt =
    phase.phase === "saved"
      ? {
          ...phase.receipt,
          current:
            phase.receipt.current &&
            (phase.receipt.steps ?? []).every((recorded) => {
              const current = steps.find(
                (step) => step.stepId === recorded.stepId,
              );
              return recorded.removed
                ? !current
                : current?.revision === recorded.afterRevision;
            }),
        }
      : null;
  const operation =
    phase.phase === "not_applied" && phase.write.kind === "apply"
      ? phase.write.operation
      : undefined;
  const matchesDraft =
    draft === undefined ||
    (operation?.type === "step.update"
      ? draft.trim() === operation.title
      : operation?.type === "step.create"
        ? operation.titles.length === 1 && draft.trim() === operation.titles[0]
        : true);
  if (phase.phase === "idle") return null;
  const stepMessage =
    phase.phase === "conflict"
      ? t("taskSteps.conflict")
      : phase.phase === "refused" && phase.reason === "task_completed"
        ? t("taskSteps.taskCompleted")
        : phase.phase === "refused" &&
            (phase.reason === "task_removed" ||
              phase.reason === "task_not_found")
          ? t("taskSteps.removedTask")
          : null;
  return (
    <div className="space-y-2">
      {stepMessage ? (
        <p className="text-sm text-destructive-label">{stepMessage}</p>
      ) : (
        <PhaseMessage
          writable={writable && matchesDraft}
          phase={phase.phase}
          phaseValue={phase}
          stateLabel={(s) => t(`taskActions.state.${s}`)}
          store={store}
          taskRef={storeKey}
          steps={steps}
        />
      )}
      {receipt && (
        <ReceiptBlock
          receipt={receipt}
          storeKey={storeKey}
          store={store}
          canWrite={writable}
        />
      )}
    </div>
  );
}
