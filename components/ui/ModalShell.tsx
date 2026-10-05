"use client";

import { useEffect, useId, useRef } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import {
  DialogOverlay,
  DialogPanel,
  DialogPresence,
} from "@/components/ui/Dialog";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Lightweight dialog shell for short forms (change email / password). Locks body
 * scroll, closes on Escape / overlay click (unless `busy`), traps Tab focus
 * inside the dialog and restores focus to the trigger on close, and labels itself
 * for assistive tech. For confirm-only prompts use ConfirmModal instead.
 */
export function ModalShell({
  open,
  title,
  description,
  busy = false,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  busy?: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus management — keyed on `open` only, so capture/restore fire on real
  // open/close, not on every `busy` toggle. Stash the trigger, move focus into
  // the dialog, and return it on close.
  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusables = dialog
      ? Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      : [];
    (focusables[0] ?? dialog)?.focus();
    return () => previouslyFocused?.focus?.();
  }, [open]);

  // Body-scroll lock + key handling: Escape to close, Tab to trap focus.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (!busy) onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusables = Array.from(
        dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      if (focusables.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (event.shiftKey) {
        if (active === first || !dialog.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || !dialog.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, busy, onClose]);

  // DialogPresence portals to <body>, so the fixed overlay can never be trapped
  // by an ancestor's containing block (a transform/filter/contain anywhere up
  // the tree would otherwise render it inside the page column).
  const dialog = (
    <DialogOverlay
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      role="presentation"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <DialogPanel
        ref={dialogRef}
        tabIndex={-1}
        className="w-full max-w-sm overflow-hidden rounded-card bg-surface shadow-lg outline-none"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-4">
          <div>
            <h2
              id={titleId}
              className="text-base font-semibold text-ink-secondary"
            >
              {title}
            </h2>
            {description && (
              <p className="mt-1 text-sm text-ink-muted">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label={t("common.close")}
            className="-mr-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-placeholder transition-colors hover:bg-surface-gray disabled:opacity-50"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="px-5 pt-4 pb-5">{children}</div>
      </DialogPanel>
    </DialogOverlay>
  );

  return <DialogPresence open={open}>{dialog}</DialogPresence>;
}
