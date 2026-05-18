"use client";

import { useState } from "react";
import { ConversationList } from "@/components/companion/ConversationList";
import { ChatPanel } from "@/components/companion/ChatPanel";
import {
  conversations as seedConversations,
  type ConversationThread,
} from "@/lib/mock/conversations";
import type { ChatMessage } from "@/types";

const CANNED_REPLY =
  "Thanks for asking! Here's a general overview to point you in the right " +
  "direction. Details can vary by province and change over time, so for " +
  "anything official — applications, deadlines, or eligibility — confirm with " +
  "the relevant government website or a settlement counsellor.";

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export default function CompanionPage() {
  const [threads, setThreads] =
    useState<ConversationThread[]>(seedConversations);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [freeTierRemaining, setFreeTierRemaining] = useState(3);

  const activeThread = threads.find((thread) => thread.id === activeId) ?? null;

  // TODO: replace with real data — canned reply stands in for the RAG backend.
  function handleSend(text: string) {
    const now = new Date().toISOString();
    setFreeTierRemaining((remaining) => Math.max(0, remaining - 1));

    const isNew = activeId === null;
    const targetId = activeId ?? makeId("conv");

    if (isNew) {
      const title = text.length > 44 ? `${text.slice(0, 44)}…` : text;
      setThreads((prev) => [
        { id: targetId, title, updatedAt: now, messages: [] },
        ...prev,
      ]);
      setActiveId(targetId);
    }

    const userMsg: ChatMessage = {
      id: makeId("m"),
      conversationId: targetId,
      role: "user",
      content: text,
      sources: [],
      createdAt: now,
    };
    setThreads((prev) =>
      prev.map((thread) =>
        thread.id === targetId
          ? {
              ...thread,
              messages: [...thread.messages, userMsg],
              updatedAt: now,
            }
          : thread,
      ),
    );

    setIsTyping(true);
    window.setTimeout(() => {
      const replyTime = new Date().toISOString();
      const aiMsg: ChatMessage = {
        id: makeId("m"),
        conversationId: targetId,
        role: "assistant",
        content: CANNED_REPLY,
        sources: [],
        createdAt: replyTime,
      };
      setThreads((prev) =>
        prev.map((thread) =>
          thread.id === targetId
            ? {
                ...thread,
                messages: [...thread.messages, aiMsg],
                updatedAt: replyTime,
              }
            : thread,
        ),
      );
      setIsTyping(false);
    }, 900);
  }

  return (
    <div className="flex h-screen">
      <ConversationList
        conversations={threads}
        activeId={activeId}
        onSelect={setActiveId}
        onNew={() => setActiveId(null)}
      />
      <ChatPanel
        thread={activeThread}
        isTyping={isTyping}
        freeTierRemaining={freeTierRemaining}
        onSend={handleSend}
      />
    </div>
  );
}
