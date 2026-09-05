"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { CoverLetterChatColumn } from "@/components/coverLetter/CoverLetterChatColumn";
import { CoverLetterPanel } from "@/components/coverLetter/CoverLetterPanel";
import {
  useCoverLetterDraft,
  useCoverLetterUsage,
  useSendCoverLetterMessage,
  useUpdateCoverLetterData,
} from "@/hooks/useCoverLetter";
import { CoverLetterBusyError, CoverLetterLimitError } from "@/services/coverLetter";
import {
  COVER_LETTER_DAILY_MESSAGE_LIMIT,
  emptyCoverLetter,
  isCoverLetterEmpty,
} from "@/lib/coverLetter/schema";
import type { CoverLetterUpdater } from "@/lib/coverLetter/editOps";

/**
 * AI Cover-Letter Generator — a single letter's editor: conversation (left) +
 * live letter (right), keyed by the `[letterId]` route param. The list
 * (/cover-letter) owns create/select/rename/duplicate/delete; this page edits
 * the one active letter. On mobile it's master/detail (toggle chat vs letter).
 */
export default function CoverLetterEditorPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useParams<{ letterId: string }>();
  const draftId = params.letterId;

  const [sendError, setSendError] = useState<string | null>(null);
  // Mobile master/detail: false = chat visible, true = letter visible.
  const [mobileShowLetter, setMobileShowLetter] = useState(false);

  const draftQuery = useCoverLetterDraft(draftId);
  const draft = draftQuery.data ?? null;
  const usageQuery = useCoverLetterUsage();
  const sendMessage = useSendCoverLetterMessage();
  const updateLetter = useUpdateCoverLetterData();

  const remaining =
    usageQuery.data?.remaining ?? COVER_LETTER_DAILY_MESSAGE_LIMIT;
  const limitReached = remaining <= 0;

  // The draft doesn't exist (deleted, or not owned per RLS) → back to the list.
  useEffect(() => {
    if (draftQuery.isSuccess && draftQuery.data === null) {
      router.replace("/cover-letter");
    }
  }, [draftQuery.isSuccess, draftQuery.data, router]);

  async function handleSend(text: string) {
    if (sendMessage.isPending) return;
    setSendError(null);
    try {
      await sendMessage.mutateAsync({ draftId, text });
    } catch (err) {
      if (err instanceof CoverLetterLimitError) {
        setSendError(t("coverLetter.limitReachedToast"));
      } else if (err instanceof CoverLetterBusyError) {
        setSendError(t("coverLetter.busy"));
      } else {
        console.error("Cover letter: failed to send message", err);
        setSendError(t("coverLetter.sendFailed"));
      }
    }
  }

  // Generate/refresh the full letter from the attached job posting + linked
  // resume. The job posting + resume context ride in the turn's context block, so
  // the bubble is just a plain instruction.
  function handleGenerate() {
    if (!draft?.coverLetter.jobPosting) return;
    void handleSend(t("coverLetter.jobTarget.generateUserBubble"));
  }

  function handleEditLetter(update: CoverLetterUpdater) {
    if (sendMessage.isPending) return;
    updateLetter.mutate({ draftId, update });
  }

  const letterData = draft?.coverLetter ?? emptyCoverLetter();

  return (
    <div className="flex h-[calc(100dvh_-_3.5rem_-_env(safe-area-inset-bottom))] animate-fade-in md:h-dvh">
      <CoverLetterChatColumn
        draft={draft}
        draftId={draftId}
        isTyping={sendMessage.isPending}
        errorMessage={sendError}
        remaining={remaining}
        limitReached={limitReached}
        onSend={handleSend}
        onGenerate={handleGenerate}
        mobileActive={!mobileShowLetter}
        onShowLetter={() => setMobileShowLetter(true)}
      />
      <CoverLetterPanel
        data={letterData}
        isEmpty={isCoverLetterEmpty(letterData)}
        complete={draft?.complete ?? false}
        editable={Boolean(draft)}
        editDisabled={sendMessage.isPending}
        onEditLetter={handleEditLetter}
        mobileActive={mobileShowLetter}
        onBackToChat={() => setMobileShowLetter(false)}
      />
    </div>
  );
}
