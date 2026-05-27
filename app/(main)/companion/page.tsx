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
  useSendMessage,
} from "@/hooks/useCompanion";
import type { ChatMessage } from "@/types";

// Cosmetic free-tier cap shown next to the input. Real enforcement is deferred
// until the AI backend lands; see /Users/luis/.claude/plans/* and BACKLOG.
const FREE_TIER_DAILY_LIMIT = 6;

export default function CompanionPage() {
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);

  const conversationsQuery = useConversations();
  const messagesQuery = useConversationMessages(activeId);
  const usageQuery = useChatbotUsage();
  const createConversation = useCreateConversation();
  const sendMessage = useSendMessage();

  const conversations = conversationsQuery.data ?? [];
  const messages = messagesQuery.data ?? [];
  const activeConversation = activeId
    ? (conversations.find((c) => c.id === activeId) ?? null)
    : null;

  const messageCount = usageQuery.data?.messageCount ?? 0;
  const freeTierRemaining = Math.max(0, FREE_TIER_DAILY_LIMIT - messageCount);

  async function handleSend(text: string) {
    try {
      let conversationIdentifier = activeId;
      if (!conversationIdentifier) {
        const created = await createConversation.mutateAsync(text);
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
      sendMessage.mutate({ conversationIdentifier, text });
    } catch (err) {
      console.error("Companion: failed to send message", err);
    }
  }

  return (
    <div className="flex h-screen">
      <ConversationList
        conversations={conversations}
        activeId={activeId}
        onSelect={setActiveId}
        onNew={() => setActiveId(null)}
      />
      <ChatPanel
        conversation={activeConversation}
        messages={messages}
        isTyping={sendMessage.isPending}
        freeTierRemaining={freeTierRemaining}
        onSend={handleSend}
      />
    </div>
  );
}
