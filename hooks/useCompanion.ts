import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as companion from "@/services/companion";
import type { ChatMessage, Conversation } from "@/types";

/** React Query hooks for Companion (AI chat). */

const CONVERSATIONS_KEY = ["conversations"] as const;
const CHATBOT_USAGE_KEY = ["chatbot-usage"] as const;

export function messagesKey(conversationIdentifier: string) {
  return ["conversation-messages", conversationIdentifier] as const;
}

// Stand-in for the real RAG response. Replaced when the AI backend lands.
const CANNED_REPLY =
  "Thanks for asking! Here's a general overview to point you in the right " +
  "direction. Details can vary by province and change over time, so for " +
  "anything official — applications, deadlines, or eligibility — confirm with " +
  "the relevant government website or a settlement counsellor.";

const ASSISTANT_REPLY_DELAY_MS = 900;

export function useConversations() {
  return useQuery({
    queryKey: CONVERSATIONS_KEY,
    queryFn: companion.getConversations,
  });
}

export function useConversationMessages(
  conversationIdentifier: string | null,
) {
  return useQuery({
    queryKey: messagesKey(conversationIdentifier ?? ""),
    queryFn: () => companion.getMessages(conversationIdentifier as string),
    enabled: !!conversationIdentifier,
    // Keep the cache fresh for 30s so an optimistic message pushed by
    // useSendMessage isn't immediately overwritten by a mount-time refetch
    // (matches mobile's useConversationMessages staleTime).
    staleTime: 30_000,
  });
}

export function useChatbotUsage() {
  return useQuery({
    queryKey: CHATBOT_USAGE_KEY,
    queryFn: companion.getChatbotUsage,
  });
}

/**
 * Creates a new conversation row and seeds the conversation list cache so the
 * sidebar shows it immediately. The caller (the Companion page) sets it as
 * active and then fires useSendMessage with the new id.
 */
export function useCreateConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (firstMessage: string) =>
      companion.createConversation(firstMessage),
    onSuccess: (created) => {
      queryClient.setQueryData<Conversation[]>(
        CONVERSATIONS_KEY,
        (prev) => [created, ...(prev ?? [])],
      );
    },
  });
}

interface SendMessageInput {
  conversationIdentifier: string;
  text: string;
}

interface SendMessageContext {
  key: ReturnType<typeof messagesKey>;
}

/**
 * Persists the user message, waits ~900ms, then persists a canned assistant
 * reply. Optimistically appends the user bubble to the messages cache so it
 * renders before the network round-trip resolves. Real LLM/RAG generation is
 * deferred — when wired, replace the setTimeout + CANNED_REPLY with the
 * streaming call and pass the returned sources to saveMessage.
 */
export function useSendMessage() {
  const queryClient = useQueryClient();
  return useMutation<
    { conversationIdentifier: string },
    Error,
    SendMessageInput,
    SendMessageContext
  >({
    mutationFn: async ({ conversationIdentifier, text }) => {
      await companion.saveMessage({
        conversationIdentifier,
        role: "user",
        content: text,
      });
      await new Promise<void>((resolve) =>
        setTimeout(resolve, ASSISTANT_REPLY_DELAY_MS),
      );
      await companion.saveMessage({
        conversationIdentifier,
        role: "assistant",
        content: CANNED_REPLY,
        sources: null,
      });
      return { conversationIdentifier };
    },
    onMutate: async ({ conversationIdentifier, text }) => {
      const key = messagesKey(conversationIdentifier);
      await queryClient.cancelQueries({ queryKey: key });
      const optimisticUserMessage: ChatMessage = {
        // Negative ids avoid collision with the bigint server ids and read as
        // "not yet persisted" anywhere keying on the value.
        id: -Date.now(),
        conversationId: conversationIdentifier,
        role: "user",
        content: text,
        sources: null,
        createdAt: new Date().toISOString(),
      };
      queryClient.setQueryData<ChatMessage[]>(key, (prev) => [
        ...(prev ?? []),
        optimisticUserMessage,
      ]);
      return { key };
    },
    onError: (_err, _vars, context) => {
      // Partial failures (user-save ok, assistant-save not) leave a row on the
      // server the cache wouldn't otherwise show. Re-fetch to converge.
      if (context) {
        queryClient.invalidateQueries({ queryKey: context.key });
      }
    },
    onSuccess: ({ conversationIdentifier }) => {
      queryClient.invalidateQueries({
        queryKey: messagesKey(conversationIdentifier),
      });
      queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY });
    },
  });
}
