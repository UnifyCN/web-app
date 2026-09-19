"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { CoverLetterChatColumn } from "@/components/coverLetter/CoverLetterChatColumn";
import { CoverLetterPanel } from "@/components/coverLetter/CoverLetterPanel";
import { CoverLetterImportNextCard } from "@/components/coverLetter/CoverLetterImportNextCard";
import {
  useCoverLetterDraft,
  useCoverLetterUsage,
  useSendCoverLetterMessage,
  useUpdateCoverLetterData,
} from "@/hooks/useCoverLetter";
import { CoverLetterBusyError, CoverLetterLimitError } from "@/services/coverLetter";
import {
  trackCoverLetterGenerated,
  trackCoverLetterStarted,
} from "@/lib/analytics";
import {
  COVER_LETTER_DAILY_MESSAGE_LIMIT,
  emptyCoverLetter,
  isCoverLetterEmpty,
} from "@/lib/coverLetter/schema";
import type { CoverLetterUpdater } from "@/lib/coverLetter/editOps";

type GenerationSource = "job_posting" | "import";

/**
 * AI Cover-Letter Generator — a single letter's editor: conversation (left) +
 * live letter (right), keyed by the `[letterId]` route param. The list
 * (/cover-letter) owns create/select/rename/duplicate/delete; this page edits
 * the one active letter. On mobile it's master/detail (toggle chat vs letter).
 */
export default function CoverLetterEditorPage() {
  return (
    <Suspense fallback={null}>
      <CoverLetterEditor />
    </Suspense>
  );
}

function CoverLetterEditor() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useParams<{ letterId: string }>();
  const draftId = params.letterId;
  const searchParams = useSearchParams();

  const [sendError, setSendError] = useState<string | null>(null);
  // Mobile master/detail: false = chat visible, true = letter visible.
  const [mobileShowLetter, setMobileShowLetter] = useState(false);
  // Post-import "What next?" card: shown when the import flow navigated here with
  // `?imported=1`, until dismissed.
  const [importDismissed, setImportDismissed] = useState(false);
  const [expandJobBar, setExpandJobBar] = useState(false);
  const showImportCard =
    searchParams.get("imported") === "1" && !importDismissed;

  function dismissImportCard() {
    setImportDismissed(true);
    router.replace(`/cover-letter/${draftId}`);
  }

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

  // Returns true when the turn was sent successfully, so callers (generate) can
  // fire a `cover_letter_generated` analytics event only on a real completion.
  async function handleSend(text: string): Promise<boolean> {
    if (sendMessage.isPending) return false;
    setSendError(null);
    try {
      await sendMessage.mutateAsync({ draftId, text });
      return true;
    } catch (err) {
      if (err instanceof CoverLetterLimitError) {
        setSendError(t("coverLetter.limitReachedToast"));
      } else if (err instanceof CoverLetterBusyError) {
        setSendError(t("coverLetter.busy"));
      } else {
        console.error("Cover letter: failed to send message", err);
        setSendError(t("coverLetter.sendFailed"));
      }
      return false;
    }
  }

  // Generate/refresh the full letter from the attached job posting + linked
  // resume. The job posting + resume context ride in the turn's context block, so
  // the bubble is just a plain instruction. Emits the cover_letter_started /
  // cover_letter_generated product events (source "import" from the post-import
  // entry point, "job_posting" from the job-target bar).
  async function handleGenerate(source: GenerationSource = "job_posting") {
    if (!draft?.coverLetter.jobPosting) return;
    // Defensive: if invoked as an event handler, coerce anything non-"import".
    const src: GenerationSource = source === "import" ? "import" : "job_posting";
    trackCoverLetterStarted({ source: src });
    const ok = await handleSend(t("coverLetter.jobTarget.generateUserBubble"));
    if (ok) trackCoverLetterGenerated();
  }

  function handleImportTailor() {
    dismissImportCard();
    if (draft?.coverLetter.jobPosting) void handleGenerate("import");
    else setExpandJobBar(true);
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
        autoExpandJobBar={expandJobBar}
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

      <CoverLetterImportNextCard
        open={showImportCard}
        onChatRefine={dismissImportCard}
        onTailor={handleImportTailor}
      />
    </div>
  );
}
