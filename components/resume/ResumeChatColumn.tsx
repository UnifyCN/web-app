"use client";

import { FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ChatColumn } from "@/components/documents/ChatColumn";
import { JobTargetBar } from "./JobTargetBar";
import type { ResumeChatMessage, ResumeDraft } from "@/types/resume";

interface ResumeChatColumnProps {
  draft: ResumeDraft | null;
  /** The active draft's id (for the job-posting target actions). */
  draftId: string | null;
  isTyping: boolean;
  errorMessage: string | null;
  remaining: number;
  limitReached: boolean;
  onSend: (text: string) => void;
  /** Fire a tailoring turn against the current job-posting target. */
  onTailor: () => void;
  /** Mobile master/detail: is the chat the visible pane (vs the resume)? */
  mobileActive: boolean;
  /** Mobile master/detail: reveal the resume pane. */
  onShowResume: () => void;
}

/**
 * Resume Builder chat column — a thin, feature-specific wrapper around the shared
 * {@link ChatColumn}. Supplies the resume icon/back-link/copy, the resume job
 * target bar, and no resume-link bar / no message-list a11y live region (the
 * resume column never had one — preserved as-is).
 */
export function ResumeChatColumn({
  draft,
  draftId,
  isTyping,
  errorMessage,
  remaining,
  limitReached,
  onSend,
  onTailor,
  mobileActive,
  onShowResume,
}: ResumeChatColumnProps) {
  const { t } = useTranslation();

  return (
    <ChatColumn<ResumeChatMessage>
      messages={draft?.messages ?? []}
      title={draft?.title ?? t("resume.title")}
      headerIcon={FileText}
      backHref="/resume"
      backLabel={t("resume.list.backToList")}
      showDocumentLabel={t("resume.viewResume")}
      jobBar={
        <JobTargetBar
          draftId={draftId}
          jobPosting={draft?.resume.jobPosting}
          disabled={isTyping || limitReached}
          busy={isTyping}
          onTailor={onTailor}
        />
      }
      isTyping={isTyping}
      errorMessage={errorMessage}
      limitReached={limitReached}
      limitReachedLabel={t("resume.limitReached")}
      inputPlaceholder={t("resume.inputPlaceholder")}
      suggestionsHint={t("resume.suggestionsHint")}
      remainingLabel={t("resume.messagesRemaining", { count: remaining })}
      mobileActive={mobileActive}
      onSend={onSend}
      onShowDocument={onShowResume}
    />
  );
}
