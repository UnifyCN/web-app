"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { ResumeChatColumn } from "@/components/resume/ResumeChatColumn";
import { ResumePanel } from "@/components/resume/ResumePanel";
import {
  useResumeDraft,
  useResumeUsage,
  useSendResumeMessage,
  useUpdateResumeData,
} from "@/hooks/useResume";
import { ResumeBusyError, ResumeLimitError } from "@/services/resume";
import {
  RESUME_DAILY_MESSAGE_LIMIT,
  emptyResume,
  isResumeEmpty,
} from "@/lib/resume/schema";
import type { ResumeUpdater } from "@/lib/resume/editOps";

/**
 * AI Resume Builder — a single resume's editor: conversation (left) + live
 * resume (right), keyed by the `[draftId]` route param. The "My Resumes" list
 * (/resume) owns create/select/rename/duplicate/delete; this page just edits the
 * one active draft. On mobile it's master/detail (toggle chat vs resume).
 */
export default function ResumeEditorPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useParams<{ draftId: string }>();
  const draftId = params.draftId;

  const [sendError, setSendError] = useState<string | null>(null);
  // Mobile master/detail: false = chat visible, true = resume visible.
  const [mobileShowResume, setMobileShowResume] = useState(false);

  const draftQuery = useResumeDraft(draftId);
  const draft = draftQuery.data ?? null;
  const usageQuery = useResumeUsage();
  const sendMessage = useSendResumeMessage();
  const updateResume = useUpdateResumeData();

  const remaining = usageQuery.data?.remaining ?? RESUME_DAILY_MESSAGE_LIMIT;
  const limitReached = remaining <= 0;

  // The draft doesn't exist (deleted, or not owned per RLS) → back to the list.
  useEffect(() => {
    if (draftQuery.isSuccess && draftQuery.data === null) {
      router.replace("/resume");
    }
  }, [draftQuery.isSuccess, draftQuery.data, router]);

  async function handleSend(text: string) {
    // Serialize turns: ignore a new send while one is still in flight.
    if (sendMessage.isPending) return;
    setSendError(null);
    try {
      await sendMessage.mutateAsync({ draftId, text });
    } catch (err) {
      if (err instanceof ResumeLimitError) {
        setSendError(t("resume.limitReachedToast"));
      } else if (err instanceof ResumeBusyError) {
        setSendError(t("resume.busy"));
      } else {
        console.error("Resume: failed to send message", err);
        setSendError(t("resume.sendFailed"));
      }
    }
  }

  // Manual inline edit → persist to the SAME draft.resume the AI reads/writes.
  // Guarded against an in-flight turn (which overwrites with its snapshot).
  function handleEditResume(update: ResumeUpdater) {
    if (sendMessage.isPending) return;
    updateResume.mutate({ draftId, update });
  }

  const resumeData = draft?.resume ?? emptyResume();

  return (
    <div className="flex h-[calc(100dvh_-_3.5rem_-_env(safe-area-inset-bottom))] animate-fade-in md:h-dvh">
      <ResumeChatColumn
        draft={draft}
        isTyping={sendMessage.isPending}
        errorMessage={sendError}
        remaining={remaining}
        limitReached={limitReached}
        onSend={handleSend}
        mobileActive={!mobileShowResume}
        onShowResume={() => setMobileShowResume(true)}
      />
      <ResumePanel
        data={resumeData}
        isEmpty={isResumeEmpty(resumeData)}
        complete={draft?.complete ?? false}
        editable={Boolean(draft)}
        editDisabled={sendMessage.isPending}
        onEditResume={handleEditResume}
        mobileActive={mobileShowResume}
        onBackToChat={() => setMobileShowResume(false)}
      />
    </div>
  );
}
