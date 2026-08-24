"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ResumeChatColumn } from "@/components/resume/ResumeChatColumn";
import { ResumePanel } from "@/components/resume/ResumePanel";
import {
  useCreateResumeDraft,
  useDeleteResumeDraft,
  useResumeDraft,
  useResumeDrafts,
  useResumeUsage,
  useSendResumeMessage,
} from "@/hooks/useResume";
import { useCurrentUser } from "@/hooks/useProfile";
import {
  ResumeBusyError,
  ResumeLimitError,
} from "@/services/resume";
import {
  RESUME_DAILY_MESSAGE_LIMIT,
  emptyResume,
  isResumeEmpty,
} from "@/lib/resume/schema";

/**
 * AI Resume Builder — split screen: conversation (left) + live-rendering resume
 * (right). Mirrors the Companion two-pane flex; on mobile it's master/detail
 * (toggle between chat and resume). Drafts + the daily cap are local-only.
 */
export default function ResumePage() {
  const { t } = useTranslation();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  // Mobile master/detail: false = chat visible, true = resume visible.
  const [mobileShowResume, setMobileShowResume] = useState(false);

  const draftsQuery = useResumeDrafts();
  const drafts = useMemo(() => draftsQuery.data ?? [], [draftsQuery.data]);
  const currentUserQuery = useCurrentUser();
  // The shown draft: the explicitly-selected one, else the newest. Deriving it
  // (rather than syncing via setState in an effect) auto-follows list changes —
  // a freshly created draft becomes drafts[0] and is picked up here.
  const effectiveActiveId = activeId ?? drafts[0]?.id ?? null;
  const draftQuery = useResumeDraft(effectiveActiveId);
  const draft = draftQuery.data ?? null;
  const usageQuery = useResumeUsage();

  const createDraft = useCreateResumeDraft();
  const sendMessage = useSendResumeMessage();
  const deleteDraft = useDeleteResumeDraft();

  const remaining = usageQuery.data?.remaining ?? RESUME_DAILY_MESSAGE_LIMIT;
  const limitReached = remaining <= 0;

  // Bootstrap: when the user has no drafts at all, create a first one (once the
  // current user has loaded so contact prefill is populated). No setState here —
  // the new draft surfaces via `effectiveActiveId`'s drafts[0] fallback.
  const bootstrapping = useRef(false);
  useEffect(() => {
    if (bootstrapping.current) return;
    if (!draftsQuery.isSuccess || drafts.length > 0) return;
    if (!currentUserQuery.isFetched) return;
    bootstrapping.current = true;
    createDraft.mutateAsync().catch(() => {
      bootstrapping.current = false;
    });
  }, [draftsQuery.isSuccess, drafts.length, currentUserQuery.isFetched, createDraft]);

  async function handleSend(text: string) {
    if (!effectiveActiveId) return;
    // Serialize turns: ignore a new send while one is still in flight so two
    // mutations can't read the same draft and overwrite each other.
    if (sendMessage.isPending) return;
    setSendError(null);
    try {
      await sendMessage.mutateAsync({ draftId: effectiveActiveId, text });
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

  async function handleNewDraft() {
    setSendError(null);
    try {
      const created = await createDraft.mutateAsync();
      setActiveId(created.id);
      setMobileShowResume(false);
    } catch (err) {
      console.error("Resume: failed to create draft", err);
    }
  }

  function handleSelectDraft(id: string) {
    setSendError(null);
    setActiveId(id);
    setMobileShowResume(false);
  }

  async function handleDeleteDraft(id: string) {
    try {
      await deleteDraft.mutateAsync(id);
      if (id === effectiveActiveId) {
        // Drop the explicit selection; effectiveActiveId falls back to the next
        // newest draft. If none remain, re-arm the bootstrap to create a fresh one.
        setActiveId(null);
        if (drafts.filter((d) => d.id !== id).length === 0) {
          bootstrapping.current = false;
        }
      }
    } catch (err) {
      console.error("Resume: failed to delete draft", err);
    }
  }

  const resumeData = draft?.resume ?? emptyResume();

  return (
    <div className="flex h-[calc(100dvh_-_3.5rem_-_env(safe-area-inset-bottom))] animate-fade-in md:h-dvh">
      <ResumeChatColumn
        draft={draft}
        drafts={drafts}
        activeId={effectiveActiveId}
        isTyping={sendMessage.isPending}
        errorMessage={sendError}
        remaining={remaining}
        limitReached={limitReached}
        onSend={handleSend}
        onSelectDraft={handleSelectDraft}
        onNewDraft={handleNewDraft}
        onDeleteDraft={handleDeleteDraft}
        mobileActive={!mobileShowResume}
        onShowResume={() => setMobileShowResume(true)}
      />
      <ResumePanel
        data={resumeData}
        isEmpty={isResumeEmpty(resumeData)}
        complete={draft?.complete ?? false}
        mobileActive={mobileShowResume}
        onBackToChat={() => setMobileShowResume(false)}
      />
    </div>
  );
}
