"use client";

import { useEffect, useRef } from "react";
import { AnimatedDottedBackground } from "./AnimatedDottedBackground";
import { StarterPromptChips } from "./StarterPromptChips";
import { MessageBubble } from "./MessageBubble";
import { ChatInput } from "./ChatInput";
import { FreeTierIndicator } from "./FreeTierIndicator";
import type { ConversationThread } from "@/lib/mock/conversations";

interface ChatPanelProps {
  thread: ConversationThread | null;
  isTyping: boolean;
  freeTierRemaining: number;
  onSend: (text: string) => void;
}

function TypingIndicator() {
  return (
    <div className="mt-4 flex justify-start">
      <div className="flex items-center gap-1 rounded-2xl bg-surface-chatbot px-4 py-3">
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
  thread,
  isTyping,
  freeTierRemaining,
  onSend,
}: ChatPanelProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread?.messages.length, isTyping]);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-surface">
      {/* Conversation header — shows the full title (the list is narrow). */}
      {thread && (
        <header className="flex h-14 shrink-0 items-center border-b border-border-card px-6">
          <h1 className="truncate text-sm font-semibold text-ink-secondary">
            {thread.title}
          </h1>
        </header>
      )}

      {thread ? (
        <div className="scrollbar-thin flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-2xl px-6 py-6">
            {thread.messages.map((message, index) => {
              const prev = thread.messages[index - 1];
              const next = thread.messages[index + 1];
              return (
                <MessageBubble
                  key={message.id}
                  message={message}
                  groupedWithPrev={prev?.role === message.role}
                  groupedWithNext={next?.role === message.role}
                />
              );
            })}
            {isTyping && <TypingIndicator />}
            <div ref={endRef} />
          </div>
        </div>
      ) : (
        <div className="relative flex-1 overflow-y-auto">
          <AnimatedDottedBackground />
          <div className="relative mx-auto flex w-full max-w-2xl flex-col items-center px-6 py-16 text-center">
            <h1 className="text-2xl font-bold text-ink-secondary">
              Ask me anything.
            </h1>
            <p className="mt-1 text-sm text-ink-muted">
              Fact-checked answers about anything in Canada.
            </p>
            <p className="mb-3 mt-8 self-start text-xs font-medium text-ink-placeholder">
              Try one of these
            </p>
            <StarterPromptChips onSelect={onSend} />
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-border-card px-6 py-3">
        <div className="mx-auto w-full max-w-2xl space-y-1.5">
          <ChatInput onSend={onSend} />
          <FreeTierIndicator remaining={freeTierRemaining} />
          <p className="text-center text-xs text-ink-placeholder">
            Companion can make mistakes. Verify important info.
          </p>
        </div>
      </div>
    </div>
  );
}
