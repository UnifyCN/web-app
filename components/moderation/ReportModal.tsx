"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ModalShell } from "@/components/ui/ModalShell";
import { Button } from "@/components/ui/Button";

const MIN_REASON = 5;
const MAX_REASON = 500;

export type ReportTarget =
  | { type: "post" }
  | { type: "user" }
  | { type: "discussion" }
  | { type: "discussion-reply" };

/** i18n keys per target type; resolved with t() inside the component. */
const TARGET_KEYS: Record<
  ReportTarget["type"],
  { title: string; placeholder: string }
> = {
  post: {
    title: "reportScreen.titlePost",
    placeholder: "reportScreen.placeholderPost",
  },
  user: {
    title: "reportScreen.titleUser",
    placeholder: "reportScreen.placeholderUser",
  },
  discussion: {
    title: "reportScreen.titleQuestion",
    placeholder: "reportScreen.placeholderQuestion",
  },
  "discussion-reply": {
    title: "reportScreen.titleReply",
    placeholder: "reportScreen.placeholderReply",
  },
};

/**
 * Free-text report form (mirrors mobile's ReportScreen): a single reason field
 * (5–500 chars) with a live counter. The reason is "private, only visible to
 * moderators." Parent owns `open`/`isPending`, fires the report on submit, and
 * closes once it settles (the success toast lives in the parent).
 */
export function ReportModal({
  open,
  target,
  isPending,
  onSubmit,
  onClose,
}: {
  open: boolean;
  target: ReportTarget;
  isPending: boolean;
  onSubmit: (reason: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  // Clear the field when the modal transitions closed (covers cancel + submit),
  // using the previous-prop pattern so we never setState inside an effect.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) setReason("");
  }
  const copy = TARGET_KEYS[target.type];
  const trimmed = reason.trim();
  const tooShort = trimmed.length < MIN_REASON;

  return (
    <ModalShell
      open={open}
      busy={isPending}
      onClose={onClose}
      title={t(copy.title)}
      description={t("reportScreen.privacyNote")}
    >
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value.slice(0, MAX_REASON))}
        rows={4}
        maxLength={MAX_REASON}
        autoFocus
        placeholder={t(copy.placeholder)}
        aria-label={t(copy.placeholder)}
        className="w-full resize-none rounded-card border border-border bg-surface px-3 py-2 text-base text-ink-muted outline-none transition-colors placeholder:text-ink-placeholder focus:border-primary"
      />
      <div className="mt-1 flex justify-end">
        <span className="text-xs text-ink-placeholder">
          {reason.length}/{MAX_REASON}
        </span>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onClose}
          disabled={isPending}
        >
          {t("common.cancel")}
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={() => onSubmit(trimmed)}
          disabled={tooShort || isPending}
          loading={isPending}
        >
          {t("report.sendReport")}
        </Button>
      </div>
    </ModalShell>
  );
}
