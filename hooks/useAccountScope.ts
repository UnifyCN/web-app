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
  CONVERSATION_PLANS_ROOT,
  PLAN_PROPOSAL_ROOT,
  PLANS_ROOT,
  TASK_PROGRESS_ROOT,
  TASK_PROPOSAL_ROOT,
} from "@/lib/companionActions/queryKeys";
import { clearTaskActionStores } from "@/lib/companionActions/taskActionStore";
import { clearPlanStores } from "@/lib/companionActions/planStore";

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
    clearPlanStores(userId);
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
      // Plans and plan drafts (#364).
      PLANS_ROOT,
      PLAN_PROPOSAL_ROOT,
      CONVERSATION_PLANS_ROOT,
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
