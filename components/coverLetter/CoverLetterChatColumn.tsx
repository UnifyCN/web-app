"use client";

import { Mail } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ChatColumn } from "@/components/documents/ChatColumn";
import { CoverLetterJobTargetBar } from "./CoverLetterJobTargetBar";
import { CoverLetterResumeLinkBar } from "./CoverLetterResumeLinkBar";
import type { CoverLetterChatMessage, CoverLetterDraft } from "@/types/coverLetter";

interface CoverLetterChatColumnProps {
  draft: CoverLetterDraft | null;
  draftId: string | null;
  isTyping: boolean;
  errorMessage: string | null;
  remaining: number;
  limitReached: boolean;
  onSend: (text: string) => void;
  /** Fire a generation turn against the current job-posting target. */
  onGenerate: () => void;
  /** One-shot: auto-expand the job bar (used after post-import "Generate tailored"). */
  autoExpandJobBar?: boolean;
  /** Mobile master/detail: is the chat the visible pane (vs the letter)? */
  mobileActive: boolean;
  onShowLetter: () => void;
}

/**
 * Cover Letter Generator chat column — a thin, feature-specific wrapper around
 * the shared {@link ChatColumn}. Supplies the cover-letter icon/back-link/copy,
 * the cover-letter job target bar, the resume-link bar (rendered between the job
 * bar and the message list), and the message-list a11y live region
 * (role="log" / aria-live="polite" / aria-relevant="additions") this feature
 * carries — both preserved as-is.
 */
export function CoverLetterChatColumn({
  draft,
  draftId,
  isTyping,
  errorMessage,
  remaining,
  limitReached,
  onSend,
  onGenerate,
  autoExpandJobBar,
  mobileActive,
  onShowLetter,
}: CoverLetterChatColumnProps) {
  const { t } = useTranslation();

  return (
    <ChatColumn<CoverLetterChatMessage>
      messages={draft?.messages ?? []}
      title={draft?.title ?? t("coverLetter.title")}
      headerIcon={Mail}
      backHref="/cover-letter"
      backLabel={t("coverLetter.list.backToList")}
      showDocumentLabel={t("coverLetter.viewLetter")}
      jobBar={
        <CoverLetterJobTargetBar
          draftId={draftId}
          jobPosting={draft?.coverLetter.jobPosting}
          disabled={isTyping || limitReached}
          busy={isTyping}
          onGenerate={onGenerate}
          autoExpand={autoExpandJobBar}
        />
      }
      afterJobBar={
        <CoverLetterResumeLinkBar
          draftId={draftId}
          resumeDraftId={draft?.coverLetter.resumeDraftId}
          disabled={isTyping}
        />
      }
      logRole="log"
      ariaLive="polite"
      ariaRelevant="additions"
      isTyping={isTyping}
      errorMessage={errorMessage}
      limitReached={limitReached}
      limitReachedLabel={t("coverLetter.limitReached")}
      inputPlaceholder={t("coverLetter.inputPlaceholder")}
      suggestionsHint={t("coverLetter.suggestionsHint")}
      remainingLabel={t("coverLetter.messagesRemaining", { count: remaining })}
      mobileActive={mobileActive}
      onSend={onSend}
      onShowDocument={onShowLetter}
    />
  );
}
