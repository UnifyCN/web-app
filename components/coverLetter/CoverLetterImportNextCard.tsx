"use client";

import { MessageSquare, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ModalShell } from "@/components/ui/ModalShell";

export function CoverLetterImportNextCard({
  open,
  onChatRefine,
  onTailor,
}: {
  open: boolean;
  onChatRefine: () => void;
  onTailor: () => void;
}) {
  const { t } = useTranslation();
  if (!open) return null;
  return (
    <ModalShell
      open
      title={t("coverLetter.import.next.title")}
      description={t("coverLetter.import.next.body")}
      onClose={onChatRefine}
    >
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onTailor}
          className="flex cursor-pointer items-center justify-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
        >
          <Sparkles className="h-4 w-4" aria-hidden />
          {t("coverLetter.import.next.tailor")}
        </button>
        <button
          type="button"
          onClick={onChatRefine}
          className="flex cursor-pointer items-center justify-center gap-1.5 rounded-full border border-border-card bg-surface px-4 py-2.5 text-sm font-semibold text-ink-secondary transition-colors hover:bg-surface-gray"
        >
          <MessageSquare className="h-4 w-4" aria-hidden />
          {t("coverLetter.import.next.chat")}
        </button>
      </div>
    </ModalShell>
  );
}
