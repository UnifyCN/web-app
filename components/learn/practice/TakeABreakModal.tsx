"use client";

import { useEffect, useRef } from "react";

interface TakeABreakModalProps {
  open: boolean;
  onSaveAndLeave: () => void;
  onContinue: () => void;
}

/**
 * Confirm shown when the user taps the quiz's X button. Mirrors the mobile
 * "Take a break from this quiz?" sheet: a dark "Save progress & leave" primary
 * and a light "Continue Activity" secondary. Focus moves to Continue on open
 * and Tab is trapped between the two buttons.
 */
export function TakeABreakModal({
  open,
  onSaveAndLeave,
  onContinue,
}: TakeABreakModalProps) {
  const continueRef = useRef<HTMLButtonElement>(null);
  const leaveRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) continueRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onContinue();
        return;
      }
      if (event.key === "Tab") {
        const from = event.shiftKey ? continueRef : leaveRef;
        const to = event.shiftKey ? leaveRef : continueRef;
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
  }, [open, onContinue]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onContinue}
      role="presentation"
    >
      <div
        className="w-full max-w-sm rounded-card bg-surface p-6 shadow-lg"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="take-a-break-title"
      >
        <h2
          id="take-a-break-title"
          className="text-center text-lg font-bold text-ink-secondary"
        >
          Take a break from this quiz?
        </h2>
        <p className="mt-2 text-center text-sm text-ink-muted">
          Your progress will be saved. You can resume from the section page
          later.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <button
            ref={leaveRef}
            type="button"
            onClick={onSaveAndLeave}
            className="w-full rounded-md bg-ink-tertiary py-3 text-sm font-semibold text-white transition-colors hover:bg-ink-secondary"
          >
            Save progress &amp; leave
          </button>
          <button
            ref={continueRef}
            type="button"
            onClick={onContinue}
            className="w-full rounded-md bg-surface-gray py-3 text-sm font-semibold text-ink-secondary transition-colors hover:bg-surface-input"
          >
            Continue Activity
          </button>
        </div>
      </div>
    </div>
  );
}
