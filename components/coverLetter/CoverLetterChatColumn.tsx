"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Mail, PanelRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn, RTL_FLIP } from "@/lib/utils";
import { ChatInput } from "@/components/companion/ChatInput";
import { CoverLetterSuggestionChips } from "./CoverLetterSuggestionChips";
import { CoverLetterJobTargetBar } from "./CoverLetterJobTargetBar";
import { CoverLetterResumeLinkBar } from "./CoverLetterResumeLinkBar";
import type { CoverLetterChatMessage, CoverLetterDraft } from "@/types/coverLetter";

function TypingIndicator() {
  return (
    <div className="mt-4 flex justify-start">
      <div className="flex items-center gap-1 rounded-2xl border border-border-card bg-surface px-4 py-3">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 animate-typing-dot rounded-full bg-ink-inactive"
            style={{ animationDelay: `${i * 160}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

function Bubble({ message }: { message: CoverLetterChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="mt-4 flex animate-message-in justify-end">
        <div className="max-w-[85%] rounded-2xl bg-primary-light px-4 py-2.5 text-sm leading-relaxed text-white">
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="mt-4 flex animate-message-in justify-start">
      <div className="w-full rounded-2xl border border-border-card bg-surface px-4 py-3 shadow-sm">
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink-secondary">
          {message.content}
        </p>
      </div>
    </div>
  );
}

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
  /** Mobile master/detail: is the chat the visible pane (vs the letter)? */
  mobileActive: boolean;
  onShowLetter: () => void;
}

export function CoverLetterChatColumn({
  draft,
  draftId,
  isTyping,
  errorMessage,
  remaining,
  limitReached,
  onSend,
  onGenerate,
  mobileActive,
  onShowLetter,
}: CoverLetterChatColumnProps) {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messages = draft?.messages ?? [];

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isTyping]);

  function handleSend(text: string) {
    if (isTyping) return;
    onSend(text);
    setInput("");
  }

  const lastMessage = messages[messages.length - 1];
  const activeSuggestions =
    !isTyping && lastMessage?.role === "assistant"
      ? (lastMessage.suggestions ?? [])
      : [];

  function pickSuggestion(text: string) {
    setInput(text);
    inputRef.current?.focus();
  }

  return (
    <div
      className={cn(
        "h-full min-w-0 flex-col bg-surface md:flex md:w-[400px] md:shrink-0 md:border-e md:border-border-card lg:w-[440px]",
        mobileActive ? "flex" : "hidden",
      )}
    >
      <header className="flex h-14 shrink-0 items-center gap-1 border-b border-border-card px-3">
        <Link
          href="/cover-letter"
          aria-label={t("coverLetter.list.backToList")}
          className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-gray hover:text-ink"
        >
          <ArrowLeft className={cn("h-5 w-5", RTL_FLIP)} aria-hidden />
        </Link>
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <Mail className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span className="truncate text-sm font-semibold text-ink-secondary">
            {draft?.title ?? t("coverLetter.title")}
          </span>
        </div>
        <button
          type="button"
          onClick={onShowLetter}
          aria-label={t("coverLetter.viewLetter")}
          className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-gray hover:text-ink md:hidden"
        >
          <PanelRight className={cn("h-5 w-5", RTL_FLIP)} aria-hidden />
        </button>
      </header>

      <CoverLetterJobTargetBar
        draftId={draftId}
        jobPosting={draft?.coverLetter.jobPosting}
        disabled={isTyping || limitReached}
        busy={isTyping}
        onGenerate={onGenerate}
      />

      <CoverLetterResumeLinkBar
        draftId={draftId}
        resumeDraftId={draft?.coverLetter.resumeDraftId}
        disabled={isTyping}
      />

      <div className="scrollbar-thin flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl px-4 py-5">
          {messages.map((m) => (
            <Bubble key={m.id} message={m} />
          ))}
          {isTyping && <TypingIndicator />}
          <div ref={endRef} />
        </div>
      </div>

      <div className="space-y-2 border-t border-border-card px-4 py-3">
        {activeSuggestions.length > 0 && (
          <CoverLetterSuggestionChips
            suggestions={activeSuggestions}
            onPick={pickSuggestion}
          />
        )}
        {errorMessage && (
          <p role="alert" className="text-center text-xs font-medium text-destructive">
            {errorMessage}
          </p>
        )}
        {limitReached ? (
          <div className="rounded-2xl bg-surface-gray px-4 py-3 text-center text-xs text-ink-muted">
            {t("coverLetter.limitReached")}
          </div>
        ) : (
          <ChatInput
            value={input}
            onValueChange={setInput}
            onSend={handleSend}
            inputRef={inputRef}
            placeholder={t("coverLetter.inputPlaceholder")}
            disabled={isTyping}
          />
        )}
        <p className="text-center text-[11px] text-ink-placeholder">
          {t("coverLetter.messagesRemaining", { count: remaining })}
        </p>
      </div>
    </div>
  );
}
