"use client";

import { useEffect, useState } from "react";
import { X, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
        aria-label={t("groups.requestGroup")}
      >
        {submitted ? (
          <div className="flex flex-col items-center px-6 py-12 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-priority-optional-bg">
              <Check className="h-6 w-6 text-priority-optional" aria-hidden />
            </span>
            <h2 className="mt-4 text-base font-semibold text-ink-secondary">
              {t("groups.requestSent")}
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              {t("groups.requestFollowUp")}
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-border-card px-5 py-4">
              <h2 className="text-base font-semibold text-ink-secondary">
                {t("groups.requestGroup")}
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label={t("common.close")}
                className="cursor-pointer rounded-md p-2 text-ink-muted transition-colors hover:bg-surface-gray hover:text-ink"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <form
              onSubmit={handleSubmit}
              className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4"
            >
              <Field label={t("groups.requestNameLabel")}>
                <input
                  type="text"
                  value={groupName}
                  onChange={(event) => setGroupName(event.target.value)}
                  placeholder={t("groups.requestNamePlaceholder")}
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label={t("groups.requestAudienceLabel")}>
                <input
                  type="text"
                  value={audience}
                  onChange={(event) => setAudience(event.target.value)}
                  placeholder={t("groups.requestAudiencePlaceholder")}
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label={t("groups.requestReasonLabel")}>
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder={t("groups.requestReasonPlaceholder")}
                  className={`${INPUT_CLASS} min-h-[88px] resize-none`}
                />
              </Field>
              <Field label={t("groups.requestEmailLabel")}>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={t("groups.requestEmailPlaceholder")}
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label={t("groups.requestNotesLabel")}>
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder={t("groups.requestNotesPlaceholder")}
                  className={`${INPUT_CLASS} min-h-[64px] resize-none`}
                />
              </Field>
              <p className="text-xs text-ink-placeholder">
                {t("groups.requestReviewNote")}
              </p>
              <Button
                type="submit"
                variant="primary"
                className="w-full"
                disabled={!canSubmit}
              >
                {t("groups.sendRequest")}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
