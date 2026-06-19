"use client";

import { useEffect, useState } from "react";
import { X, Check } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface RequestGroupModalProps {
  open: boolean;
  onClose: () => void;
}

const INPUT_CLASS =
  "w-full rounded-lg border border-border-card bg-surface px-3 py-2 text-base " +
  "text-ink-muted placeholder:text-ink-placeholder focus-visible:outline-none " +
  "focus-visible:ring-2 focus-visible:ring-primary";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-secondary">
        {label}
      </span>
      {children}
    </label>
  );
}

/** "Request a Group" form modal. Frontend stub — no real submission. */
export function RequestGroupModal({ open, onClose }: RequestGroupModalProps) {
  const [groupName, setGroupName] = useState("");
  const [audience, setAudience] = useState("");
  const [reason, setReason] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);

  // Escape to close + lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  // Reset the form when the modal closes — during render (the React-sanctioned
  // "adjust state on prop change" pattern) rather than in an effect.
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (!open) {
      setSubmitted(false);
      setGroupName("");
      setAudience("");
      setReason("");
      setEmail("");
      setNotes("");
    }
  }

  if (!open) return null;

  const canSubmit =
    groupName.trim().length >= 1 &&
    audience.trim().length >= 1 &&
    reason.trim().length >= 10 &&
    email.trim().length >= 5;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    // TODO: replace with real data — POST the request to the backend.
    setSubmitted(true);
    window.setTimeout(onClose, 1800);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-card bg-surface shadow-lg"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Request a group"
      >
        {submitted ? (
          <div className="flex flex-col items-center px-6 py-12 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-priority-optional-bg">
              <Check className="h-6 w-6 text-priority-optional" aria-hidden />
            </span>
            <h2 className="mt-4 text-base font-semibold text-ink-secondary">
              Request sent!
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              Thanks — we review every request and follow up by email.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-border-card px-5 py-4">
              <h2 className="text-base font-semibold text-ink-secondary">
                Request a Group
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="cursor-pointer rounded-md p-2 text-ink-muted transition-colors hover:bg-surface-gray hover:text-ink"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <form
              onSubmit={handleSubmit}
              className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4"
            >
              <Field label="Group name">
                <input
                  type="text"
                  value={groupName}
                  onChange={(event) => setGroupName(event.target.value)}
                  placeholder="e.g. Newcomer Cyclists"
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="Who is this group for?">
                <input
                  type="text"
                  value={audience}
                  onChange={(event) => setAudience(event.target.value)}
                  placeholder="e.g. Newcomers who commute by bike"
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="Why should we create it?">
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Tell us a little about the need (at least 10 characters)."
                  className={`${INPUT_CLASS} min-h-[88px] resize-none`}
                />
              </Field>
              <Field label="Your email">
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="Anything else? (optional)">
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Extra notes for the team"
                  className={`${INPUT_CLASS} min-h-[64px] resize-none`}
                />
              </Field>
              <p className="text-xs text-ink-placeholder">
                We review every request and follow up by email.
              </p>
              <Button
                type="submit"
                variant="primary"
                className="w-full"
                disabled={!canSubmit}
              >
                Send Request
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
