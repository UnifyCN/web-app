"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BookOpen } from "lucide-react";
import { MessageBubble } from "@/components/companion/MessageBubble";
import { ChatInput } from "@/components/companion/ChatInput";
import { FreeTierIndicator } from "@/components/companion/FreeTierIndicator";
import {
  messagesKey,
  useChatbotUsage,
  useConversationMessages,
  useCreateConversation,
  useSendMessage,
} from "@/hooks/useCompanion";
import { ChatLimitError, FREE_TIER_DAILY_LIMIT } from "@/services/companion";
import type { ChatMessage, LessonContext } from "@/types";

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

/**
 * Lesson-scoped AI chat (PRD R3) — the drawer's AI path. Composes the
 * Companion's bubble/input/quota pieces into a slim panel with the lesson
 * context pinned up top. The conversation persists to normal Companion
 * history (created lazily on first send, tagged source "in-lesson") and every
 * send carries `lessonContext` so rag-query scopes its answer to the lesson.
 * The parent owns `conversationId` so switching chooser views doesn't spawn a
 * new conversation per visit.
 */
export function InLessonChat({
  lessonContext,
  conversationId,
  onConversationCreated,
}: {
  lessonContext: LessonContext;
  conversationId: string | null;
  onConversationCreated: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const endRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);

  const messagesQuery = useConversationMessages(conversationId);
  const usageQuery = useChatbotUsage();
  const createConversation = useCreateConversation();
  const sendMessage = useSendMessage();

  const messages = messagesQuery.data ?? [];
  const freeTierRemaining = Math.max(
    0,
    FREE_TIER_DAILY_LIMIT - (usageQuery.data?.messageCount ?? 0),
  );
  const isTyping = sendMessage.isPending;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isTyping]);

  // Starter prompts derived from the lesson (user-perspective questions).
  const starterPrompts = [
    `Explain "${lessonContext.lessonTitle}" in simple terms`,
    `Why does this matter for newcomers?`,
    `What should I do after finishing this lesson?`,
  ];

  async function handleSend(text: string) {
    // Guard the conversation-creation window: without this, a rapid second send
    // (e.g. double-tapping starter chips) fires createConversation twice and
    // spawns a duplicate conversation before the first id is set.
    if (createConversation.isPending) return;
    setSendError(null);
    setDraft("");
    try {
      let id = conversationId;
      if (!id) {
        const created = await createConversation.mutateAsync({
          firstMessage: text,
          options: { source: "in-lesson", lessonId: lessonContext.lessonId },
        });
        id = created.id;
        // Pre-seed an empty messages list so the mount-time fetch can't race
        // the optimistic user bubble (same guard as the Companion page).
        queryClient.setQueryData<ChatMessage[]>(messagesKey(id), []);
        onConversationCreated(id);
      }
      await sendMessage.mutateAsync({
        conversationIdentifier: id,
        text,
        lessonContext,
      });
    } catch (err) {
      setSendError(
        err instanceof ChatLimitError
          ? err.message
          : "Something went wrong sending that. Please try again.",
      );
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Lesson context chip — pinned above the thread */}
      <div className="border-b border-border-card px-5 py-3">
        <div className="flex items-start gap-2 rounded-card bg-teal-50 px-3 py-2 text-xs text-teal-800">
          <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="min-w-0">
            <span className="font-medium">Context: </span>
            {lessonContext.moduleTitle} › {lessonContext.submoduleTitle} ›{" "}
            {lessonContext.lessonTitle}
          </span>
        </div>
      </div>

      {/* Thread */}
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {/* Static intro bubble (not persisted) */}
        <div className="flex justify-start">
          <div className="max-w-[85%] rounded-2xl border border-border-card bg-surface px-4 py-3 text-sm leading-relaxed text-ink-muted">
            Hi! I can see you&apos;re on{" "}
            <span className="font-semibold text-ink-secondary">
              {lessonContext.lessonTitle}
            </span>
            . Ask me anything about this lesson and I&apos;ll keep my answer
            specific to it.
          </div>
        </div>

        {messages.length === 0 && !isTyping && (
          <div className="mt-4 space-y-2">
            {starterPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => handleSend(prompt)}
                disabled={createConversation.isPending}
                className="block w-full cursor-pointer rounded-full border border-teal-600/40 px-4 py-2 text-left text-sm text-teal-700 transition-colors hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}

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
              onSuggestionClick={handleSend}
            />
          );
        })}
        {isTyping && <TypingIndicator />}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border-card px-5 py-3">
        <div className="space-y-1.5">
          {sendError && (
            <p
              role="alert"
              className="text-center text-xs font-medium text-destructive"
            >
              {sendError}
            </p>
          )}
          <ChatInput
            value={draft}
            onValueChange={setDraft}
            onSend={handleSend}
            placeholder="Ask about this lesson…"
          />
          <FreeTierIndicator remaining={freeTierRemaining} />
        </div>
      </div>
    </div>
  );
}
