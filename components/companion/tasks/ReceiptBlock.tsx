"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type { TaskReceipt, TaskState } from "@/lib/companionActions/contract";
import type { TaskActionStore } from "@/lib/companionActions/taskActionStore";

interface ReceiptBlockProps {
  receipt: TaskReceipt;
  /** Where this receipt's Undo is tracked in the store (a task ref or `proposal:<id>`). */
  storeKey: string;
  store: TaskActionStore | null;
  /** A connection, a fresh read and no unresolved write. */
  canWrite: boolean;
}

/**
 * The exact saved result of one action and the Undo of that receipt only
 * (mobile-app#361, #363). An added task's Undo removes it, so it asks first; Keep
 * sends nothing.
 */
export function ReceiptBlock({
  receipt,
  storeKey,
  store,
  canWrite,
}: ReceiptBlockProps) {
  const { t, i18n } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const stateLabel = (s: TaskState) => t(`taskActions.state.${s}`);
  const title = receipt.title ?? "";
  const steps = receipt.steps ?? [];
  const first = steps[0];
  const isStep = receipt.operationType.startsWith("step.");
  // #366: a step receipt names the steps as they were saved, never their current text.
  const stepText = (): string => {
    const stepTitle = first?.title ?? "";
    switch (receipt.operationType) {
      case "step.create":
        return steps.length === 1
          ? t("taskSteps.receiptAdded", { title: stepTitle })
          : t("taskSteps.receiptAddedMany", { count: steps.length });
      case "step.update":
        return t("taskSteps.receiptRenamed", {
          from: first?.beforeTitle ?? "",
          to: stepTitle,
        });
      case "step.set_done":
        return first?.done
          ? t("taskSteps.receiptChecked", { title: stepTitle })
          : t("taskSteps.receiptUnchecked", { title: stepTitle });
      case "step.restore":
        return t("taskSteps.receiptRestored", { title: stepTitle });
      default:
        return steps.length === 1
          ? t("taskSteps.receiptRemoved", { title: stepTitle })
          : t("taskSteps.receiptRemovedMany", { count: steps.length });
    }
  };
  const text = isStep
    ? stepText()
    : receipt.operationType === "task.create_custom"
      ? t("taskCreate.added", { title })
      : receipt.operationType === "task.remove_created"
        ? t("taskCreate.removed", { title })
        : receipt.kind === "undo"
          ? t("taskActions.receiptUndo", {
              state: stateLabel(receipt.afterState),
            })
          : receipt.beforeState === "waiting" &&
              receipt.afterState === "waiting"
            ? t("taskActions.receiptReason")
            : t("taskActions.receiptChange", {
                from: stateLabel(receipt.beforeState),
                to: stateLabel(receipt.afterState),
              });
  const time = new Intl.DateTimeFormat(i18n.language, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(receipt.createdAt));
  // Undo of an added task or added steps removes them: it asks first.
  const removes =
    receipt.operationType === "task.create_custom" ||
    receipt.operationType === "step.create";
  const confirmTitle = isStep
    ? steps.length === 1
      ? t("taskSteps.confirmRemove", { title: first?.title ?? "" })
      : t("taskSteps.confirmRemoveMany", { count: steps.length })
    : t("taskCreate.confirmRemove", { title });

  function undo() {
    if (!canWrite || !store) return;
    if (removes) {
      setConfirming(true);
      return;
    }
    void store.undo(storeKey, receipt.operationId);
  }

  return (
    <div className="rounded-lg border border-border-card bg-surface-card px-3 py-2.5">
      <p className="break-words text-sm text-ink-secondary">{text}</p>
      {receipt.stepsTotal !== null && receipt.stepsTotal > 0 && (
        <p className="mt-0.5 text-xs text-ink-muted">
          {t("taskSteps.receiptAtCompletion", {
            done: receipt.stepsDone ?? 0,
            total: receipt.stepsTotal,
          })}
        </p>
      )}
      <p className="mt-0.5 text-xs text-ink-muted">
        {time}
        {!receipt.current && ` · ${t("taskActions.receiptHistorical")}`}
      </p>
      {receipt.undoable && !confirming && (
        <button
          type="button"
          aria-disabled={!canWrite}
          aria-label={
            isStep
              ? t("taskSteps.undoA11y")
              : removes
                ? t("taskCreate.undoA11y", { title })
                : undefined
          }
          data-drawer-focus=""
          onClick={undo}
          className={cn(
            "mt-1.5 inline-flex min-h-11 items-center gap-1.5 rounded text-sm font-semibold text-ink-secondary underline underline-offset-2",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            canWrite
              ? "press cursor-pointer hover:text-ink"
              : "cursor-not-allowed opacity-60",
          )}
        >
          <Undo2 className="h-4 w-4" aria-hidden />
          {isStep
            ? t("taskSteps.undo")
            : removes
              ? t("taskCreate.undo")
              : t("taskActions.undo")}
        </button>
      )}
      {confirming && (
        <div className="mt-2 rounded-lg border border-primary-subtle bg-primary-bg px-3 py-3">
          <p className="break-words text-sm font-semibold text-ink-secondary">
            {confirmTitle}
          </p>
          <p className="mt-1 text-sm text-ink-tertiary">
            {isStep
              ? t("taskSteps.confirmRemoveBody")
              : t("taskCreate.confirmRemoveBody")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {/* Dark fill as in the reviewed prototype: white on the brand orange is below 4.5:1. */}
            <Button
              type="button"
              size="sm"
              aria-disabled={!canWrite}
              className={cn(
                "bg-ink-secondary hover:bg-ink",
                !canWrite && "cursor-not-allowed opacity-60",
              )}
              onClick={() => {
                if (!canWrite || !store) return;
                setConfirming(false);
                void store.undo(storeKey, receipt.operationId, {
                  removalConfirmed: true,
                });
              }}
            >
              {isStep ? t("taskSteps.remove") : t("taskCreate.remove")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              data-drawer-focus=""
              onClick={() => setConfirming(false)}
            >
              {isStep ? t("taskSteps.keep") : t("taskCreate.keep")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
