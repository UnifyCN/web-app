"use client";

import { useEffect, useRef } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";

interface DeleteTaskModalProps {
  open: boolean;
  taskTitle: string;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Destructive confirm for deleting a custom checklist task. Parent owns the
 * open state and closes it once the mutation settles, keeping the buttons
 * disabled (isPending) until the delete resolves. Modeled on
 * DeleteConversationModal: focus starts on Cancel (safer than the destructive
 * action), Tab is trapped between Cancel and Delete, ESC cancels, body scroll
 * is locked.
 */
export function DeleteTaskModal({
  open,
  taskTitle,
  isPending,
  onConfirm,
  onCancel,
}: DeleteTaskModalProps) {
  const { t } = useTranslation();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);

  // Move focus to Cancel on open.
  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  // ESC to cancel, Tab trap between Cancel/Delete, body scroll lock.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isPending) {
        onCancel();
        return;
      }
      if (event.key === "Tab") {
        const from = event.shiftKey ? cancelRef : deleteRef;
        const to = event.shiftKey ? deleteRef : cancelRef;
        if (document.activeElement === from.current) {
          event.preventDefault();
          to.current?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, isPending, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={() => {
        if (!isPending) onCancel();
      }}
      role="presentation"
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-card bg-surface shadow-lg"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-task-title"
      >
        <div className="px-5 py-4">
          <h2
            id="delete-task-title"
            className="text-base font-semibold text-ink-secondary"
          >
            {t("checklist.deleteTaskTitle")}
          </h2>
          <p className="mt-2 text-sm text-ink-muted">
            <Trans
              i18nKey="checklist.deleteTaskDesc"
              values={{ title: taskTitle }}
              components={{
                strong: <span className="font-medium text-ink-secondary" />,
              }}
            />
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border-card bg-surface-card px-5 py-3">
          <Button
            ref={cancelRef}
            type="button"
            variant="secondary"
            size="sm"
            onClick={onCancel}
            disabled={isPending}
          >
            {t("common.cancel")}
          </Button>
          <Button
            ref={deleteRef}
            type="button"
            variant="destructive"
            size="sm"
            onClick={onConfirm}
            loading={isPending}
          >
            {t("common.delete")}
          </Button>
        </div>
      </div>
    </div>
  );
}
