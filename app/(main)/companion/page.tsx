"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ConversationList } from "@/components/companion/ConversationList";
import { ChatPanel } from "@/components/companion/ChatPanel";
import {
  CompanionTasksEntry,
  TaskActionsDrawer,
} from "@/components/companion/tasks/TaskActionsDrawer";
import { TaskActionCards } from "@/components/companion/tasks/TaskActionCards";
import { PlanEntry, type PlanTarget } from "@/components/companion/plans/PlanEntry";
import { PlanCards } from "@/components/companion/plans/PlanCards";
import { useConversationPlans, usePlanStore } from "@/hooks/usePlans";
import {
  useConversationActions,
  useTaskActionStore,
  useTaskProgress,
} from "@/hooks/useTaskActions";
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
import type { CompanionInputSource } from "@/lib/companionAnalytics";
import type { ChatMessage } from "@/types";
import { ownAccountWork, stillOwned } from "@/lib/accountSession";

export default function CompanionPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  // Surfaced beneath the input — e.g. the daily-limit message (rag-query 429).
  const [sendError, setSendError] = useState<string | null>(null);
  // Mobile-only master/detail: when true the conversation list is shown instead
  // of the chat (the two sit side-by-side only at md+). Ignored on desktop.
  const [mobileListOpen, setMobileListOpen] = useState(false);
  // Direction B: task progress, a task draft (#363) or one task opens in an
  // overlay drawer; the chat and its draft stay mounted behind it.
  const [drawer, setDrawer] = useState<
    | { kind: "tasks" }
    | { kind: "proposal"; proposalId: string }
    | { kind: "task"; taskId: string }
    | { kind: "plan"; target: PlanTarget }
    | null
  >(null);

  const conversationsQuery = useConversations();
  const messagesQuery = useConversationMessages(activeId);
  const usageQuery = useChatbotUsage();
  const currentUser = useCurrentUser().data;
  // A different signed-in account (or sign-out) must not see the previous
  // account's open conversation, sources drawer or unsent draft. The chat panel
  // remounts on each account change; loading the first account is not one.
  const accountId = currentUser?.id ?? null;
  const [account, setAccount] = useState({ id: accountId, epoch: 0 });
  if (accountId !== account.id) {
    const changed = account.id !== null;
    setAccount({ id: accountId, epoch: account.epoch + (changed ? 1 : 0) });
    if (changed) {
      setActiveId(null);
      setSendError(null);
      setMobileListOpen(false);
      setDrawer(null);
    }
  }
  const createConversation = useCreateConversation();
  const sendMessage = useSendMessage();
  const deleteConversation = useDeleteConversation();

  const conversations = conversationsQuery.data ?? [];
  const messages = messagesQuery.data ?? [];
  // #363: drafts and command results of the open conversation, for its cards.
  const actionsQuery = useConversationActions(activeId);
  const actionStore = useTaskActionStore("companion");
  const progress = useTaskProgress();
  const actions = actionsQuery.data;
  // #364: the plan drafts of the open conversation, and the account's plan store.
  const plansQuery = useConversationPlans(activeId);
  const planStore = usePlanStore("companion");
  const openTaskRef = (taskRef: string) =>
    setDrawer({ kind: "task", taskId: taskRef.slice(taskRef.indexOf(":") + 1) });
  const activeConversation = activeId
    ? (conversations.find((c) => c.id === activeId) ?? null)
    : null;

  const messageCount = usageQuery.data?.messageCount ?? 0;
  const freeTierRemaining = Math.max(0, FREE_TIER_DAILY_LIMIT - messageCount);

  async function handleSend(text: string, inputSource: CompanionInputSource) {
    setSendError(null);
    // Results of this send reach this page only while its account is signed
    // in (#361): another account sees no conversation, message or error from it.
    const owner = ownAccountWork();
    try {
      let conversationIdentifier = activeId;
      const isNewConversation = !conversationIdentifier;
      if (!conversationIdentifier) {
        const created = await createConversation.mutateAsync({
          firstMessage: text,
          owner,
        });
        if (!stillOwned(owner)) return;
        conversationIdentifier = created.id;
        // Pre-seed an empty messages list for the new conversation. Without
        // this, useConversationMessages mounts and fires a server fetch that
        // can race the optimistic user-bubble write inside useSendMessage's
        // onMutate (Supabase round-trip returns [] before the user-save lands,
        // wiping the optimistic message).
        queryClient.setQueryData<ChatMessage[]>(
          messagesKey(conversationIdentifier, owner.accountId),
          [],
        );
        setActiveId(conversationIdentifier);
      }
      await sendMessage.mutateAsync({
        conversationIdentifier,
        text,
        inputSource,
        isNewConversation,
        owner,
      });
    } catch (err) {
      if (!stillOwned(owner)) return;
      // The daily free-tier cap surfaces as a typed ChatLimitError (rag-query
      // 429, relayed by the /api/companion proxy) — show localized limit copy;
      // anything else gets a generic retry prompt instead of failing silently.
      if (err instanceof ChatLimitError) {
        setSendError(t("companion.dailyLimitReachedToast"));
      } else {
        console.error("Companion: failed to send message", err);
        setSendError(t("companion.sendFailed"));
      }
    }
  }

  async function handleDelete(conversationIdentifier: string) {
    try {
      await deleteConversation.mutateAsync({
        conversationIdentifier,
        owner: ownAccountWork(),
      });
      if (conversationIdentifier === activeId) setActiveId(null);
    } catch (err) {
      console.error("Companion: failed to delete conversation", err);
      throw err;
    }
  }

  return (
    <div className="flex h-[calc(100dvh_-_3.5rem_-_env(safe-area-inset-bottom))] md:h-dvh">
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
        key={account.epoch}
        conversation={activeConversation}
        messages={messages}
        isTyping={sendMessage.isPending}
        freeTierRemaining={freeTierRemaining}
        errorMessage={sendError}
        onSend={handleSend}
        onboarding={currentUser?.onboarding ?? null}
        mobileActive={!mobileListOpen}
        onOpenList={() => setMobileListOpen(true)}
        taskEntry={
          <>
            <CompanionTasksEntry onOpen={() => setDrawer({ kind: "tasks" })} />
            <PlanEntry onOpen={(target) => setDrawer({ kind: "plan", target })} />
          </>
        }
        renderAfterMessage={(message) => (
          <>
          <TaskActionCards
            message={message}
            proposals={actions?.proposals ?? []}
            commands={actions?.commands ?? []}
            store={actionStore}
            canWrite={progress.canWrite}
            onReview={(proposalId) =>
              setDrawer({ kind: "proposal", proposalId })
            }
            onViewTask={(taskRef) =>
              setDrawer({
                kind: "task",
                taskId: taskRef.slice(taskRef.indexOf(":") + 1),
              })
            }
          />
          <PlanCards
            message={message}
            proposals={plansQuery.data ?? []}
            store={planStore}
            onOpen={(proposalId) => setDrawer({ kind: "plan", target: { proposalId } })}
          />
          </>
        )}
      />
      <TaskActionsDrawer
        open={drawer !== null}
        onClose={() => setDrawer(null)}
        surface="companion"
        initialTaskId={drawer?.kind === "task" ? drawer.taskId : null}
        proposalId={drawer?.kind === "proposal" ? drawer.proposalId : null}
        plan={drawer?.kind === "plan" ? drawer.target : null}
        onOpenTask={openTaskRef}
      />
    </div>
  );
}
