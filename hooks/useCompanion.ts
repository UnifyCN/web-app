import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import * as companion from "@/services/companion";
import {
  trackCompanionMessageSent,
  trackCompanionResponseReceived,
  trackInLessonAiQuestionSent,
} from "@/lib/analytics";
import {
  companionTurnNumber,
  type CompanionInputSource,
} from "@/lib/companionAnalytics";
import type { ChatMessage, Conversation, LessonContext } from "@/types";
import { useAccountId } from "@/hooks/useAccountId";
import { AUTH_USER_KEY } from "@/hooks/useAuthUser";
import {
  AccountChangedError,
  ownAccountWork,
  stillOwned,
  type AccountOwner,
} from "@/lib/accountSession";
import {
  CONVERSATIONS_ROOT,
  conversationsKey,
  messagesKey,
} from "@/lib/companion/conversationKeys";

/** React Query hooks for Companion (AI chat). */

const CHATBOT_USAGE_KEY = ["chatbot-usage"] as const;

export {
  CONVERSATIONS_ROOT,
  MESSAGES_ROOT,
  conversationsKey,
  messagesKey,
} from "@/lib/companion/conversationKeys";

export function useConversations() {
  const accountId = useAccountId();
  // The list is read only as the account its entry belongs to (#361).
  const owner = ownAccountWork();
  return useQuery({
    queryKey: conversationsKey(accountId),
    queryFn: () => companion.getConversations(owner),
    enabled: Boolean(accountId),
  });
}

export function useConversationMessages(
  conversationIdentifier: string | null,
) {
  const accountId = useAccountId();
  const owner = ownAccountWork();
  return useQuery({
    queryKey: messagesKey(conversationIdentifier ?? "", accountId),
    queryFn: () =>
      companion.getMessages(conversationIdentifier as string, owner),
    enabled: !!conversationIdentifier && Boolean(accountId),
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
    mutationFn: async ({
      firstMessage,
      options,
      owner,
    }: {
      firstMessage: string;
      options?: companion.CreateConversationOptions;
      /** The account the conversation is created for (#361). */
      owner: AccountOwner;
    }) => {
      const created = await companion.createConversation(
        firstMessage,
        options ?? {},
        owner,
      );
      // Another account signed in meanwhile: its list and page get nothing.
      if (!stillOwned(owner)) throw new AccountChangedError();
      return created;
    },
    // The account that asked for the conversation owns its list entry.
    onSuccess: (created, { owner }) => {
      if (!stillOwned(owner)) return;
      queryClient.setQueryData<Conversation[]>(
        conversationsKey(owner.accountId),
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
  /** How the user produced the message (companion_message_sent). */
  inputSource: CompanionInputSource;
  /** True when this message starts the conversation (it was just created).
   *  Lets turn_number be 1 without waiting for a history load. */
  isNewConversation: boolean;
  /** The account signed in when the user sent it (#361). It owns every request
   *  and cache write of this send. */
  owner: AccountOwner;
}

interface SendMessageContext {
  key: ReturnType<typeof messagesKey>;
}

/** Stops a send whose account is no longer signed in, before its next request. */
function ensureOwned(owner: AccountOwner) {
  if (!stillOwned(owner)) throw new AccountChangedError();
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
    { conversationIdentifier: string; accountId: string | null },
    Error,
    SendMessageInput,
    SendMessageContext
  >({
    mutationFn: async ({
      conversationIdentifier,
      text,
      lessonContext,
      inputSource,
      isNewConversation,
      owner,
    }) => {
      ensureOwned(owner);
      // Prior turns = persisted messages already in the cache. Optimistic
      // bubbles carry negative ids (see onMutate) so we drop them, then keep
      // the last 10 turns to bound the prompt size.
      const cached =
        queryClient.getQueryData<ChatMessage[]>(
          messagesKey(conversationIdentifier, owner.accountId),
        ) ?? [];
      // The cache already holds this send's optimistic bubble (onMutate runs
      // first), so the first message of a conversation is turn 1. Undefined
      // (left out of the event) if an existing conversation's history has not
      // loaded yet.
      const turnNumber = companionTurnNumber(cached, isNewConversation);
      const history = cached
        .filter((m) => m.id >= 0)
        .slice(-10)
        .map((m) => ({ role: m.role, message: m.content }));

      await companion.saveMessage({
        conversationIdentifier,
        role: "user",
        content: text,
        owner,
      });
      ensureOwned(owner);
      // The message is "sent" once persisted — track here so it counts even if
      // the reply generation below fails (onSuccess wouldn't fire then).
      trackCompanionMessageSent({
        messageLength: text.length,
        conversationId: conversationIdentifier,
        turnNumber,
        inputSource,
      });
      if (lessonContext) {
        trackInLessonAiQuestionSent({
          moduleId: lessonContext.moduleId,
          lessonId: lessonContext.lessonId,
          messageLength: text.length,
        });
      }

      const responseLanguage =
        i18n.language && i18n.language !== "en" ? i18n.language : undefined;
      const replyStartedAt = performance.now();
      const reply = await companion.generateReply({
        conversationIdentifier,
        prompt: text,
        history,
        lessonContext,
        responseLanguage,
        owner,
      });
      ensureOwned(owner);
      const { answer, sources, suggestedNextSteps, disclaimerKind } = reply;
      trackCompanionResponseReceived({
        queryType: reply.queryType,
        topic: reply.topic,
        hasSources: (sources?.length ?? 0) > 0,
        promptTokens: reply.tokenUsage?.promptTokens,
        completionTokens: reply.tokenUsage?.completionTokens,
        totalTokens: reply.tokenUsage?.totalTokens,
        estimatedCostUsd: reply.estimatedCostUsd ?? undefined,
        responseTimeMs: Math.round(performance.now() - replyStartedAt),
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
        // Saved with the answer so a reopened conversation shows the same
        // sources and context. Never sent to analytics.
        companionContext: reply.contextRecord,
        owner,
      });
      return { conversationIdentifier, accountId: owner.accountId };
    },
    onMutate: async ({ conversationIdentifier, text, owner }) => {
      const key = messagesKey(conversationIdentifier, owner.accountId);
      await queryClient.cancelQueries({ queryKey: key });
      // Another account signed in meanwhile: write nothing under the old one.
      if (!stillOwned(owner)) return { key };
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
    onError: (_err, { owner }, context) => {
      // Partial failures (user-save ok, assistant-save not) leave a row on the
      // server the cache wouldn't otherwise show. Re-fetch to converge.
      if (context && stillOwned(owner)) {
        queryClient.invalidateQueries({ queryKey: context.key });
      }
    },
    onSuccess: ({ conversationIdentifier, accountId }, { owner }) => {
      if (!stillOwned(owner)) return;
      queryClient.invalidateQueries({
        queryKey: messagesKey(conversationIdentifier, accountId),
      });
      queryClient.invalidateQueries({ queryKey: [CONVERSATIONS_ROOT] });
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
    { conversationIdentifier: string; owner: AccountOwner },
    { previous: Conversation[] | undefined }
  >({
    mutationFn: ({ conversationIdentifier, owner }) =>
      companion.deleteConversation(conversationIdentifier, owner),
    // The list of the account that deletes is the only one it changes, and
    // only while that account is signed in (#361): a late failure never
    // restores a list that was cleared when another account signed in.
    onMutate: async ({ conversationIdentifier, owner }) => {
      const listKey = conversationsKey(owner.accountId);
      await queryClient.cancelQueries({ queryKey: listKey });
      if (!stillOwned(owner)) return { previous: undefined };
      const previous = queryClient.getQueryData<Conversation[]>(listKey);
      queryClient.setQueryData<Conversation[]>(
        listKey,
        (prev) =>
          (prev ?? []).filter((c) => c.id !== conversationIdentifier),
      );
      return { previous };
    },
    onError: (_err, { owner }, context) => {
      if (context?.previous && stillOwned(owner)) {
        queryClient.setQueryData(
          conversationsKey(owner.accountId),
          context.previous,
        );
      }
    },
    onSuccess: (_data, { conversationIdentifier, owner }) => {
      if (!stillOwned(owner)) return;
      // Drop the message-thread cache only after the server confirms — on
      // error we keep it so a rolled-back row still has its thread intact.
      queryClient.removeQueries({
        queryKey: messagesKey(conversationIdentifier, owner.accountId),
      });
      queryClient.invalidateQueries({ queryKey: [CONVERSATIONS_ROOT] });
    },
  });
}

/** Warms the Companion tab: the conversation list and today's usage (same keys
 *  and fetchers as `useConversations` / `useChatbotUsage`). */
export function prefetchCompanion(queryClient: QueryClient) {
  // The list is prefetched only for a known account, under its own key.
  const user = queryClient.getQueryData<{ id: string } | null>(AUTH_USER_KEY);
  const owner = ownAccountWork();
  return Promise.all([
    user && owner.accountId === user.id
      ? queryClient.prefetchQuery({
          queryKey: conversationsKey(user.id),
          queryFn: () => companion.getConversations(owner),
        })
      : Promise.resolve(),
    queryClient.prefetchQuery({
      queryKey: CHATBOT_USAGE_KEY,
      queryFn: companion.getChatbotUsage,
    }),
  ]);
}
