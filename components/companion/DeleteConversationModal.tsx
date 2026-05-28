"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

interface DeleteConversationModalProps {
  open: boolean;
  conversationTitle: string;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Destructive confirm for deleting a Companion conversation. Parent owns the
 * open state and closes it once the mutation settles — keeps the buttons
 * disabled (isPending) until the delete resolves rather than flashing a
 * closed-modal-then-row-removal.
 */
export function DeleteConversationModal({
  open,
  conversationTitle,
  isPending,
  onConfirm,
  onCancel,
}: DeleteConversationModalProps) {
  // ESC to cancel + lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isPending) onCancel();
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
        aria-labelledby="delete-conversation-title"
      >
        <div className="px-5 py-4">
          <h2
            id="delete-conversation-title"
            className="text-base font-semibold text-ink-secondary"
          >
            Delete this conversation?
          </h2>
          <p className="mt-2 text-sm text-ink-muted">
            This will permanently remove{" "}
            <span className="font-medium text-ink-secondary">
              &ldquo;{conversationTitle}&rdquo;
            </span>{" "}
            and all its messages. This can&rsquo;t be undone.
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border-card bg-surface-card px-5 py-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onCancel}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={onConfirm}
            loading={isPending}
          >
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}
