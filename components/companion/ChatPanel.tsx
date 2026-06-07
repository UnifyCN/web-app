"use client";

import { useEffect, useRef, useState } from "react";
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
  onSend: (text: string) => void;
  onboarding: UserOnboardingProfile | null;
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
  onSend,
  onboarding,
}: ChatPanelProps) {
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
    <div className="flex h-full min-w-0 flex-1 flex-col bg-surface">
      {/* Conversation header — shows the full title (the list is narrow). */}
      {conversation && (
        <header className="flex h-14 shrink-0 items-center border-b border-border-card px-6">
          <h1 className="truncate text-sm font-semibold text-ink-secondary">
            {conversation.title ?? "New conversation"}
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
              {firstName ? `Ask me anything, ${firstName}.` : "Ask me anything."}
            </h1>
            <p className="mt-1 text-sm text-ink-muted">
              Fact-checked answers about anything in Canada.
            </p>
            <p className="mb-3 mt-8 self-start text-xs font-medium text-ink-placeholder">
              Try one of these
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
          <ChatInput
            value={draft}
            onValueChange={setDraft}
            onSend={handleSubmit}
            inputRef={inputRef}
          />
          <FreeTierIndicator remaining={freeTierRemaining} />
          <p className="text-center text-xs text-ink-placeholder">
            Companion can make mistakes. Verify important info.
          </p>
        </div>
      </div>
    </div>
  );
}
