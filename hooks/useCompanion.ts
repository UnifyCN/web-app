import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import * as companion from "@/services/companion";
import {
  trackCompanionMessageSent,
  trackInLessonAiQuestionSent,
} from "@/lib/analytics";
import type { ChatMessage, Conversation, LessonContext } from "@/types";

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
    mutationFn: ({
      firstMessage,
      options,
    }: {
      firstMessage: string;
      options?: companion.CreateConversationOptions;
    }) => companion.createConversation(firstMessage, options),
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
  /** In-Lesson Help — set when sending from the lesson-reader chat; scopes the
   *  rag-query answer to the lesson and swaps the analytics event. */
  lessonContext?: LessonContext;
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
  // Current UI language — passed to rag-query so the reply matches the app
  // language. Read via react-i18next (the i18n instance is provider-scoped, not
  // a module singleton); English is the server default so it's sent only for
  // other languages.
  const { t, i18n } = useTranslation();
  return useMutation<
    { conversationIdentifier: string },
    Error,
    SendMessageInput,
    SendMessageContext
  >({
    mutationFn: async ({ conversationIdentifier, text, lessonContext }) => {
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
      // The message is "sent" once persisted — track here so it counts even if
      // the reply generation below fails (onSuccess wouldn't fire then).
      trackCompanionMessageSent({ messageLength: text.length });
      if (lessonContext) {
        trackInLessonAiQuestionSent({
          moduleId: lessonContext.moduleId,
          lessonId: lessonContext.lessonId,
          messageLength: text.length,
        });
      }

      const responseLanguage =
        i18n.language && i18n.language !== "en" ? i18n.language : undefined;
      const { answer, sources, suggestedNextSteps, disclaimerKind } =
        await companion.generateReply({
          conversationIdentifier,
          prompt: text,
          history,
          lessonContext,
          responseLanguage,
        });

      // rag-query returns the IRCC disclaimer as fixed English text; render it
      // from the locale files instead so it matches the answer's language.
      // Appended to the answer body because the web UI has no separate disclaimer
      // slot (mobile does). The no-KB variant leads with the extra notice, then
      // the standard one — matching the server's ordering.
      const disclaimer =
        disclaimerKind === "legalNoKb"
          ? `${t("companion.noKbDisclaimer")} ${t("companion.legalDisclaimer")}`
          : disclaimerKind === "legal"
            ? t("companion.legalDisclaimer")
            : "";
      const content = disclaimer ? `${answer}\n\n${disclaimer}` : answer;

      await companion.saveMessage({
        conversationIdentifier,
        role: "assistant",
        content,
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
