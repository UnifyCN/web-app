"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { TASKS_KEY } from "@/hooks/useChecklist";
import {
  CONVERSATIONS_ROOT,
  MESSAGES_ROOT,
} from "@/lib/companion/conversationKeys";
import { clearComposerDrafts } from "@/lib/companion/composerDrafts";
import {
  CONVERSATION_ACTIONS_ROOT,
  DETAIL_PROPOSAL_ROOT,
  STEP_PROPOSAL_ROOT,
  TASK_PROGRESS_ROOT,
  TASK_PROPOSAL_ROOT,
} from "@/lib/companionActions/queryKeys";
import { clearTaskActionStores } from "@/lib/companionActions/taskActionStore";

/**
 * Keeps private Companion and Checklist work owned by one account (mobile-app#361).
 * Checklist and task-progress queries carry the account id in their keys, so a
 * view never reads another account's entry; this removes those entries, unsent
 * messages and unresolved task actions of every other account once the signed-in
 * account changes or signs out. Conversation lists and threads, also keyed by
 * account, are dropped the same way.
 */
export function useAccountScope(userId: string | null, ready = true) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!ready) return;
    clearTaskActionStores(userId);
    clearComposerDrafts(userId);
    queryClient.removeQueries({
      queryKey: [TASK_PROGRESS_ROOT],
      predicate: (q) => q.queryKey[1] !== userId,
    });
    queryClient.removeQueries({
      queryKey: TASKS_KEY,
      predicate: (q) => q.queryKey[2] !== userId,
    });
    // Task drafts and conversation action results (#363) are private work too.
    for (const root of [
      CONVERSATIONS_ROOT,
      MESSAGES_ROOT,
      TASK_PROPOSAL_ROOT,
      CONVERSATION_ACTIONS_ROOT,
      // Suggested-step drafts (#366).
      STEP_PROPOSAL_ROOT,
      // Suggested-detail drafts (#370). Saved details live in the task-progress read.
      DETAIL_PROPOSAL_ROOT,
    ]) {
      void queryClient.cancelQueries({
        queryKey: [root],
        predicate: (q) => q.queryKey[1] !== userId,
      });
      queryClient.removeQueries({
        queryKey: [root],
        predicate: (q) => q.queryKey[1] !== userId,
      });
    }
  }, [userId, ready, queryClient]);
}
