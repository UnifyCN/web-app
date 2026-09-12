"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, PanelRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn, RTL_FLIP } from "@/lib/utils";
import { ChatInput } from "@/components/companion/ChatInput";
import { Bubble, type DocumentChatMessage } from "./Bubble";
import { TypingIndicator } from "./TypingIndicator";
import { SuggestionChips } from "./SuggestionChips";

export interface ChatColumnProps<M extends DocumentChatMessage> {
  /** Conversation turns, oldest first. */
  messages: M[];
  /** Resolved header title (feature fallback already applied by the caller). */
  title: string;
  /** Header icon (resume: FileText; cover letter: Mail). */
  headerIcon: LucideIcon;
  /** Back-link href ("/resume" vs "/cover-letter"). */
  backHref: string;
  /** aria-label for the back link (already translated). */
  backLabel: string;
  /** aria-label for the mobile "show the document pane" button (already translated). */
  showDocumentLabel: string;
  /** The job-posting target affordance — differs per feature, so it's a slot. */
  jobBar: ReactNode;
  /**
   * Optional slot rendered in the exact position between the job bar and the
   * message list (cover letter uses it for the resume-link bar; resume passes
   * nothing).
   */
  afterJobBar?: ReactNode;
  /**
   * a11y for the message scroll container's inner div. Resume passes none;
   * cover letter passes role="log" / aria-live="polite" / aria-relevant="additions".
   * Kept as-is per feature — do NOT unify.
   */
  logRole?: React.AriaRole;
  ariaLive?: React.AriaAttributes["aria-live"];
  ariaRelevant?: React.AriaAttributes["aria-relevant"];
  isTyping: boolean;
  errorMessage: string | null;
  limitReached: boolean;
  /** Message shown in place of the input when the daily limit is reached. */
  limitReachedLabel: string;
  /** Input placeholder (already translated). */
  inputPlaceholder: string;
  /** Hint shown above the suggestion chips (already translated). */
  suggestionsHint: string;
  /** "N messages left today" (already translated + interpolated). */
  remainingLabel: string;
  mobileActive: boolean;
  onSend: (text: string) => void;
  onShowDocument: () => void;
}

/**
 * Shared chat column for the document builders (Resume Builder + Cover Letter
 * Generator). Both features render a structurally identical column: header with
 * back link + icon + title + mobile toggle, a job-posting target bar, the message
 * list with a typing indicator, and the input footer (suggestion chips, error,
 * and the daily-quota notice). All per-feature differences are absorbed via props
 * or slots — there are no feature branches here.
 */
export function ChatColumn<M extends DocumentChatMessage>({
  messages,
  title,
  headerIcon: HeaderIcon,
  backHref,
  backLabel,
  showDocumentLabel,
  jobBar,
  afterJobBar,
  logRole,
  ariaLive,
  ariaRelevant,
  isTyping,
  errorMessage,
  limitReached,
  limitReachedLabel,
  inputPlaceholder,
  suggestionsHint,
  remainingLabel,
  mobileActive,
  onSend,
  onShowDocument,
}: ChatColumnProps<M>) {
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isTyping]);

  function handleSend(text: string) {
    // Block a second send while a turn is in flight — concurrent turns would
    // read the same persisted draft and clobber each other's messages.
    if (isTyping) return;
    onSend(text);
    setInput("");
  }

  // Chips come from the latest assistant turn — shown only when we're waiting
  // for the user (not mid-generation). Tapping fills the input for editing.
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
          href={backHref}
          aria-label={backLabel}
          className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-gray hover:text-ink"
        >
          <ArrowLeft className={cn("h-5 w-5", RTL_FLIP)} aria-hidden />
        </Link>
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <HeaderIcon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span className="truncate text-sm font-semibold text-ink-secondary">
            {title}
          </span>
        </div>
        <button
          type="button"
          onClick={onShowDocument}
          aria-label={showDocumentLabel}
          className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-gray hover:text-ink md:hidden"
        >
          <PanelRight className={cn("h-5 w-5", RTL_FLIP)} aria-hidden />
        </button>
      </header>

      {jobBar}

      {afterJobBar}

      <div className="scrollbar-thin flex-1 overflow-y-auto">
        <div
          className="mx-auto w-full max-w-2xl px-4 py-5"
          role={logRole}
          aria-live={ariaLive}
          aria-relevant={ariaRelevant}
        >
          {messages.map((m) => (
            <Bubble key={m.id} message={m} />
          ))}
          {isTyping && <TypingIndicator />}
          <div ref={endRef} />
        </div>
      </div>

      <div className="space-y-2 border-t border-border-card px-4 py-3">
        {activeSuggestions.length > 0 && (
          <SuggestionChips
            suggestions={activeSuggestions}
            onPick={pickSuggestion}
            hint={suggestionsHint}
          />
        )}
        {errorMessage && (
          <p role="alert" className="text-center text-xs font-medium text-destructive">
            {errorMessage}
          </p>
        )}
        {limitReached ? (
          <div className="rounded-2xl bg-surface-gray px-4 py-3 text-center text-xs text-ink-muted">
            {limitReachedLabel}
          </div>
        ) : (
          <ChatInput
            value={input}
            onValueChange={setInput}
            onSend={handleSend}
            inputRef={inputRef}
            placeholder={inputPlaceholder}
            disabled={isTyping}
          />
        )}
        <p className="text-center text-[11px] text-ink-placeholder">
          {remainingLabel}
        </p>
      </div>
    </div>
  );
}
