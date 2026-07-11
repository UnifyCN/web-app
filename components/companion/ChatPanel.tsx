"use client";

import { useEffect, useRef, useState } from "react";
import { PanelLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { StarterPromptChips } from "./StarterPromptChips";
import { MessageBubble } from "./MessageBubble";
import { ChatInput } from "./ChatInput";
import { FreeTierIndicator } from "./FreeTierIndicator";
import type {
  ChatMessage,
  Conversation,
  UserOnboardingProfile,
} from "@/types";

interface ChatPanelProps {
  conversation: Conversation | null;
  messages: ChatMessage[];
  isTyping: boolean;
  freeTierRemaining: number;
  /** Non-blocking send error (e.g. daily-limit reached) shown above the input. */
  errorMessage?: string | null;
  onSend: (text: string) => void;
  onboarding: UserOnboardingProfile | null;
  /** Mobile master/detail: is the chat the visible pane (vs the list)? */
  mobileActive: boolean;
  /** Mobile-only: open the conversation list. */
  onOpenList: () => void;
}

function TypingIndicator() {
  return (
    <div className="mt-4 flex justify-start">
      <div className="flex items-center gap-1 rounded-2xl border border-border-card bg-surface px-4 py-3">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="h-1.5 w-1.5 animate-typing-dot rounded-full bg-ink-inactive"
            style={{ animationDelay: `${index * 160}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

/** Companion right panel — empty state or an active conversation. */
export function ChatPanel({
  conversation,
  messages,
  isTyping,
  freeTierRemaining,
  errorMessage,
  onSend,
  onboarding,
  mobileActive,
  onOpenList,
}: ChatPanelProps) {
  const { t } = useTranslation();
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState("");
  const firstName = onboarding?.firstName?.trim();

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isTyping]);

  function handleSubmit(text: string) {
    onSend(text);
    setDraft("");
  }

  // A follow-up chip auto-sends immediately.
  function pickSuggestion(text: string) {
    handleSubmit(text);
  }

  return (
    <div
      className={cn(
        "h-full min-w-0 flex-1 flex-col bg-surface md:flex",
        mobileActive ? "flex" : "hidden",
      )}
    >
      {/* Mobile-only top bar: toggle to the conversation list + current title. */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border-card px-3 md:hidden">
        <button
          type="button"
          onClick={onOpenList}
          aria-label={t("companion.conversationsAria")}
          className="-ml-1 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-gray hover:text-ink"
        >
          <PanelLeft className="h-5 w-5" aria-hidden />
        </button>
        <h1 className="truncate text-sm font-semibold text-ink-secondary">
          {conversation?.title ?? t("companion.newConversation")}
        </h1>
      </header>

      {/* Conversation header (desktop) — shows the full title (the list is narrow). */}
      {conversation && (
        <header className="hidden h-14 shrink-0 items-center border-b border-border-card px-6 md:flex">
          <h1 className="truncate text-sm font-semibold text-ink-secondary">
            {conversation.title ?? t("companion.newConversation")}
          </h1>
        </header>
      )}

      {conversation ? (
        <div className="scrollbar-thin flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-6 py-6">
            {messages.map((message, index) => {
              const prev = messages[index - 1];
              const next = messages[index + 1];
              return (
                <MessageBubble
                  key={message.id}
                  message={message}
                  groupedWithPrev={prev?.role === message.role}
                  groupedWithNext={next?.role === message.role}
                  isLast={index === messages.length - 1}
                  onSuggestionClick={pickSuggestion}
                />
              );
            })}
            {isTyping && <TypingIndicator />}
            <div ref={endRef} />
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-2xl flex-col items-center px-6 py-16 text-center">
            <h1 className="text-2xl font-bold text-ink-secondary">
              {firstName
                ? t("companion.welcomeTitleNamed", { name: firstName })
                : t("companion.welcomeTitle")}
            </h1>
            <p className="mt-1 text-sm text-ink-muted">
              {t("companion.welcomeCaption")}
            </p>
            <p className="mb-3 mt-8 self-start text-xs font-medium text-ink-placeholder">
              {t("companion.tryOneOfThese")}
            </p>
            <StarterPromptChips
              onSelect={handleSubmit}
              onboarding={onboarding}
            />
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-border-card px-6 py-3">
        <div className="mx-auto w-full max-w-2xl space-y-1.5">
          {errorMessage && (
            <p
              role="alert"
              className="text-center text-xs font-medium text-destructive"
            >
              {errorMessage}
            </p>
          )}
          <ChatInput
            value={draft}
            onValueChange={setDraft}
            onSend={handleSubmit}
            inputRef={inputRef}
          />
          <FreeTierIndicator remaining={freeTierRemaining} />
          <p className="text-center text-xs text-ink-placeholder">
            {t("companion.disclaimer")}
          </p>
        </div>
      </div>
    </div>
  );
}
