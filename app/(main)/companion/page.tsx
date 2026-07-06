"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ConversationList } from "@/components/companion/ConversationList";
import { ChatPanel } from "@/components/companion/ChatPanel";
import {
  messagesKey,
  useChatbotUsage,
  useConversationMessages,
  useConversations,
  useCreateConversation,
  useDeleteConversation,
  useSendMessage,
} from "@/hooks/useCompanion";
import { useCurrentUser } from "@/hooks/useProfile";
import { ChatLimitError, FREE_TIER_DAILY_LIMIT } from "@/services/companion";
import type { ChatMessage } from "@/types";

export default function CompanionPage() {
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  // Surfaced beneath the input — e.g. the daily-limit message (rag-query 429).
  const [sendError, setSendError] = useState<string | null>(null);
  // Mobile-only master/detail: when true the conversation list is shown instead
  // of the chat (the two sit side-by-side only at md+). Ignored on desktop.
  const [mobileListOpen, setMobileListOpen] = useState(false);

  const conversationsQuery = useConversations();
  const messagesQuery = useConversationMessages(activeId);
  const usageQuery = useChatbotUsage();
  const currentUser = useCurrentUser().data;
  const createConversation = useCreateConversation();
  const sendMessage = useSendMessage();
  const deleteConversation = useDeleteConversation();

  const conversations = conversationsQuery.data ?? [];
  const messages = messagesQuery.data ?? [];
  const activeConversation = activeId
    ? (conversations.find((c) => c.id === activeId) ?? null)
    : null;

  const messageCount = usageQuery.data?.messageCount ?? 0;
  const freeTierRemaining = Math.max(0, FREE_TIER_DAILY_LIMIT - messageCount);

  async function handleSend(text: string) {
    setSendError(null);
    try {
      let conversationIdentifier = activeId;
      if (!conversationIdentifier) {
        const created = await createConversation.mutateAsync({
          firstMessage: text,
        });
        conversationIdentifier = created.id;
        // Pre-seed an empty messages list for the new conversation. Without
        // this, useConversationMessages mounts and fires a server fetch that
        // can race the optimistic user-bubble write inside useSendMessage's
        // onMutate (Supabase round-trip returns [] before the user-save lands,
        // wiping the optimistic message).
        queryClient.setQueryData<ChatMessage[]>(
          messagesKey(conversationIdentifier),
          [],
        );
        setActiveId(conversationIdentifier);
      }
      await sendMessage.mutateAsync({ conversationIdentifier, text });
    } catch (err) {
      // The daily free-tier cap surfaces as a typed ChatLimitError (rag-query
      // 429, relayed verbatim by the /api/companion proxy) — show its message;
      // anything else gets a generic retry prompt instead of failing silently.
      if (err instanceof ChatLimitError) {
        setSendError(err.message);
      } else {
        console.error("Companion: failed to send message", err);
        setSendError("Couldn't send your message. Please try again.");
      }
    }
  }

  async function handleDelete(conversationIdentifier: string) {
    try {
      await deleteConversation.mutateAsync(conversationIdentifier);
      if (conversationIdentifier === activeId) setActiveId(null);
    } catch (err) {
      console.error("Companion: failed to delete conversation", err);
      throw err;
    }
  }

  return (
    <div className="flex h-[calc(100dvh_-_3.5rem_-_env(safe-area-inset-bottom))] animate-fade-in md:h-dvh">
      <ConversationList
        conversations={conversations}
        activeId={activeId}
        mobileActive={mobileListOpen}
        onSelect={(id) => {
          setSendError(null);
          setActiveId(id);
          setMobileListOpen(false);
        }}
        onNew={() => {
          setSendError(null);
          setActiveId(null);
          setMobileListOpen(false);
        }}
        onDelete={handleDelete}
        isDeleting={deleteConversation.isPending}
      />
      <ChatPanel
        conversation={activeConversation}
        messages={messages}
        isTyping={sendMessage.isPending}
        freeTierRemaining={freeTierRemaining}
        errorMessage={sendError}
        onSend={handleSend}
        onboarding={currentUser?.onboarding ?? null}
        mobileActive={!mobileListOpen}
        onOpenList={() => setMobileListOpen(true)}
      />
    </div>
  );
}
