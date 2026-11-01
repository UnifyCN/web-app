import type { QueryClient } from "@tanstack/react-query";
import { ownAccountWork, type AccountOwner } from "@/lib/accountSession";
import { TASKS_KEY } from "@/lib/checklistQueryKeys";
import { CURRENT_USER_KEY } from "@/lib/profileQueryKeys";
import {
  CONVERSATIONS_ROOT,
  MESSAGES_ROOT,
} from "@/lib/companion/conversationKeys";
import { clearComposerDrafts } from "@/lib/companion/composerDrafts";
import {
  CONVERSATION_ACTIONS_ROOT,
  CONVERSATION_PLANS_ROOT,
  DETAIL_PROPOSAL_ROOT,
  PROFILE_PROPOSAL_ROOT,
  PLAN_PROPOSAL_ROOT,
  PLANS_ROOT,
  STEP_PROPOSAL_ROOT,
  TASK_PROGRESS_ROOT,
  TASK_PROPOSAL_ROOT,
} from "@/lib/companionActions/queryKeys";
import { clearTaskActionStores } from "@/lib/companionActions/taskActionStore";
import { clearPlanRecoveryExcept } from "@/lib/companionActions/planRecovery";
import { clearPlanStores } from "@/lib/companionActions/planStore";

/** Remove private local work. With no kept account, clear the complete scope. */
export function clearPrivateAccountWork(
  queryClient: QueryClient,
  keepAccountId?: string | null,
  preservePendingOwner?: AccountOwner,
) {
  clearTaskActionStores(keepAccountId);
  clearPlanStores(keepAccountId);
  if (keepAccountId === undefined && !preservePendingOwner)
    void clearPlanRecoveryExcept(null, () => true).catch(() => {});
  else
    void clearPlanRecoveryExcept(keepAccountId === undefined ? ownAccountWork().accountId : keepAccountId).catch(() => {});
  clearComposerDrafts(keepAccountId, preservePendingOwner);
  // This legacy key has no account part. Clear it only on a full reset,
  // not when another consumer keeps the current account's data.
  if (keepAccountId == null) {
    void queryClient.cancelQueries({ queryKey: CURRENT_USER_KEY });
    queryClient.removeQueries({ queryKey: CURRENT_USER_KEY });
  }
  const otherAccount =
    (index: number) => (q: { queryKey: readonly unknown[] }) =>
      keepAccountId === undefined || q.queryKey[index] !== keepAccountId;
  for (const [queryKey, index] of [
    [TASKS_KEY, 2],
    [["chatbot-usage"], 1],
    [[TASK_PROGRESS_ROOT], 1],
    [[CONVERSATIONS_ROOT], 1],
    [[MESSAGES_ROOT], 1],
    [[TASK_PROPOSAL_ROOT], 1],
    [[CONVERSATION_ACTIONS_ROOT], 1],
    [[PLANS_ROOT], 1],
    [[PLAN_PROPOSAL_ROOT], 1],
    [[CONVERSATION_PLANS_ROOT], 1],
    [[STEP_PROPOSAL_ROOT], 1],
    [[DETAIL_PROPOSAL_ROOT], 1],
    [[PROFILE_PROPOSAL_ROOT], 1],
  ] as const) {
    const filters = { queryKey, predicate: otherAccount(index) };
    void queryClient.cancelQueries(filters);
    queryClient.removeQueries(filters);
  }
}
