"use client";

import { useEffect, useRef } from "react";
import { Loader2, MessageCircle, X } from "lucide-react";
import type { PracticeFeedbackState } from "@/services/learn";

interface PracticeFeedbackModalProps {
  open: boolean;
  /** null while idle; carries loading / done / error once a submit fires. */
  state: PracticeFeedbackState | null;
  /** Module colour — tints the icon badge and the "Got It" button. */
  colorHex: string;
  onClose: () => void;
}

/**
 * AI coach feedback popup shown after a free-text answer is submitted. Mirrors
 * the mobile "Feedback" sheet: a coloured message-bubble badge, the feedback
 * body, and a full-width "Got It" button in the module's colour. Focus moves to
 * the dismiss button on open, Escape closes, and Tab is trapped within.
 */
export function PracticeFeedbackModal({
  open,
  state,
  colorHex,
  onClose,
}: PracticeFeedbackModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (state?.status === "loading") return;
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const focusables = root.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (event.shiftKey) {
        if (active === first || !root.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || !root.contains(active)) {
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
  }, [open, onClose, state?.status]);

  if (!open) return null;

  const isLoading = state?.status === "loading";
  const isError = state?.status === "error";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={isLoading ? undefined : onClose}
      role="presentation"
    >
      <div
        ref={dialogRef}
        className="w-full max-w-md rounded-3xl bg-surface p-6 shadow-lg"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="practice-feedback-title"
      >
        <div className="flex items-center gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: colorHex }}
            aria-hidden
          >
            <MessageCircle className="h-5 w-5 text-white" />
          </span>
          <h2
            id="practice-feedback-title"
            className="flex-1 text-xl font-bold text-ink-secondary"
          >
            Feedback
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            disabled={isLoading}
            aria-label="Close feedback"
            className="-mr-1 rounded-full p-2 text-ink-placeholder transition-colors hover:bg-surface-gray hover:text-ink-secondary disabled:pointer-events-none disabled:opacity-40"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 min-h-[3rem] text-[15px] leading-relaxed text-ink-secondary">
          {isLoading ? (
            <span className="flex items-center gap-2 text-ink-muted">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Reviewing your answer…
            </span>
          ) : isError ? (
            <span className="text-ink-muted">
              We couldn&rsquo;t load feedback right now. Your answer was still
              saved — feel free to continue.
            </span>
          ) : (
            state?.text
          )}
        </div>

        {!isLoading && (
          <button
            type="button"
            onClick={onClose}
            className="mt-6 h-12 w-full rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: colorHex }}
          >
            Got It
          </button>
        )}
      </div>
    </div>
  );
}
