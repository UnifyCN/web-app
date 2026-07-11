"use client";

import { useEffect, useId, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Visual style of the confirm button. */
  confirmVariant?: "destructive" | "primary";
  isPending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Reusable confirm dialog. Parent owns `open` and closes it once the action
 * settles, keeping the buttons disabled (isPending) until then. Modeled on
 * DeleteTaskModal / DeleteConversationModal: focus starts on Cancel (safer than
 * the confirm action), Tab is trapped between Cancel and Confirm, ESC cancels,
 * the overlay click cancels, and body scroll is locked while open.
 */
export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  confirmVariant = "destructive",
  isPending = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const { t } = useTranslation();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  // Defaults resolve here (not as prop defaults) so the hook runs first.
  const resolvedConfirmLabel = confirmLabel ?? t("common.delete");
  const resolvedCancelLabel = cancelLabel ?? t("common.cancel");

  // Move focus to Cancel on open.
  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  // ESC to cancel, Tab trap between Cancel/Confirm, body scroll lock.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isPending) {
        onCancel();
        return;
      }
      if (event.key === "Tab") {
        const from = event.shiftKey ? cancelRef : confirmRef;
        const to = event.shiftKey ? confirmRef : cancelRef;
        if (document.activeElement === from.current) {
          event.preventDefault();
          to.current?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
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
        className="w-full max-w-sm overflow-hidden rounded-card bg-surface shadow-sm"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="px-5 py-4">
          <h2 id={titleId} className="text-base font-semibold text-ink-secondary">
            {title}
          </h2>
          {description && (
            <p className="mt-2 text-sm text-ink-muted">{description}</p>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border bg-surface-card px-5 py-3">
          <Button
            ref={cancelRef}
            type="button"
            variant="secondary"
            size="sm"
            onClick={onCancel}
            disabled={isPending}
          >
            {resolvedCancelLabel}
          </Button>
          <Button
            ref={confirmRef}
            type="button"
            variant={confirmVariant}
            size="sm"
            onClick={onConfirm}
            loading={isPending}
          >
            {resolvedConfirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
