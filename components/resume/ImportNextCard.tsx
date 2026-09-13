"use client";

import { MessageSquare, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ModalShell } from "@/components/ui/ModalShell";

/**
 * Shown once right after a resume is imported (the editor opens with
 * `?imported=1`). Offers the two post-import paths: keep refining in the normal
 * conversation, or jump straight to tailoring against a job posting. Dismissing
 * (X / backdrop) is equivalent to "Chat and refine" — the imported resume is
 * already in the editor behind it.
 */
export function ImportNextCard({
  open,
  onChatRefine,
  onTailor,
}: {
  open: boolean;
  /** Dismiss and stay in the normal editor. */
  onChatRefine: () => void;
  /** Dismiss and open the job-target bar to tailor against a posting. */
  onTailor: () => void;
}) {
  const { t } = useTranslation();
  if (!open) return null;
  return (
    <ModalShell
      open
      title={t("resume.import.next.title")}
      description={t("resume.import.next.body")}
      onClose={onChatRefine}
    >
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onTailor}
          className="flex cursor-pointer items-center justify-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
        >
          <Sparkles className="h-4 w-4" aria-hidden />
          {t("resume.import.next.tailor")}
        </button>
        <button
          type="button"
          onClick={onChatRefine}
          className="flex cursor-pointer items-center justify-center gap-1.5 rounded-full border border-border-card bg-surface px-4 py-2.5 text-sm font-semibold text-ink-secondary transition-colors hover:bg-surface-gray"
        >
          <MessageSquare className="h-4 w-4" aria-hidden />
          {t("resume.import.next.chat")}
        </button>
      </div>
    </ModalShell>
  );
}
