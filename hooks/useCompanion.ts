import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as companion from "@/services/companion";
import type { ChatMessage, Conversation } from "@/types";

/** React Query hooks for Companion (AI chat). */

const CONVERSATIONS_KEY = ["conversations"] as const;
const CHATBOT_USAGE_KEY = ["chatbot-usage"] as const;

export function messagesKey(conversationIdentifier: string) {
  return ["conversation-messages", conversationIdentifier] as const;
}

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
 * Persists the user message, asks the rag-query edge function for a reply, then
 * persists the assistant message with any citations. Optimistically appends the
 * user bubble to the messages cache so it renders before the round-trip resolves.
 * Conversation history (prior persisted turns) is read from the cache and passed
 * to the function so multi-turn context is preserved.
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
      // Prior turns = persisted messages already in the cache. Optimistic
      // bubbles carry negative ids (see onMutate) so we drop them, then keep
      // the last 10 turns to bound the prompt size.
      const cached =
        queryClient.getQueryData<ChatMessage[]>(
          messagesKey(conversationIdentifier),
        ) ?? [];
      const history = cached
        .filter((m) => m.id >= 0)
        .slice(-10)
        .map((m) => ({ role: m.role, message: m.content }));

      await companion.saveMessage({
        conversationIdentifier,
        role: "user",
        content: text,
      });

      const { answer, sources, suggestedNextSteps } =
        await companion.generateReply({
          conversationIdentifier,
          prompt: text,
          history,
        });

      await companion.saveMessage({
        conversationIdentifier,
        role: "assistant",
        content: answer,
        sources,
        suggestedNextSteps,
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
      // The edge function incremented chatbot_usage server-side — refetch so
      // the free-tier "remaining" counter reflects the new count.
      queryClient.invalidateQueries({ queryKey: CHATBOT_USAGE_KEY });
    },
  });
}

/**
 * Deletes a conversation row (cascades to its messages). Optimistically
 * removes it from the conversation list and drops the cached message thread.
 * Restores the previous list on error; safety-net invalidate on success.
 */
export function useDeleteConversation() {
  const queryClient = useQueryClient();
  return useMutation<
    void,
    Error,
    string,
    { previous: Conversation[] | undefined }
  >({
    mutationFn: (conversationIdentifier) =>
      companion.deleteConversation(conversationIdentifier),
    onMutate: async (conversationIdentifier) => {
      await queryClient.cancelQueries({ queryKey: CONVERSATIONS_KEY });
      const previous = queryClient.getQueryData<Conversation[]>(
        CONVERSATIONS_KEY,
      );
      queryClient.setQueryData<Conversation[]>(
        CONVERSATIONS_KEY,
        (prev) =>
          (prev ?? []).filter((c) => c.id !== conversationIdentifier),
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(CONVERSATIONS_KEY, context.previous);
      }
    },
    onSuccess: (_data, conversationIdentifier) => {
      // Drop the message-thread cache only after the server confirms — on
      // error we keep it so a rolled-back row still has its thread intact.
      queryClient.removeQueries({
        queryKey: messagesKey(conversationIdentifier),
      });
      queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY });
    },
  });
}
