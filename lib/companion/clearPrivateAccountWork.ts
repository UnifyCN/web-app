import type { QueryClient } from "@tanstack/react-query";
import { TASKS_KEY } from "@/lib/checklistQueryKeys";
import {
  CONVERSATIONS_ROOT,
  MESSAGES_ROOT,
} from "@/lib/companion/conversationKeys";
import { clearComposerDrafts } from "@/lib/companion/composerDrafts";
import {
  CONVERSATION_ACTIONS_ROOT,
  CONVERSATION_PLANS_ROOT,
  DETAIL_PROPOSAL_ROOT,
  PLAN_PROPOSAL_ROOT,
  PLANS_ROOT,
  STEP_PROPOSAL_ROOT,
  TASK_PROGRESS_ROOT,
  TASK_PROPOSAL_ROOT,
} from "@/lib/companionActions/queryKeys";
import { clearTaskActionStores } from "@/lib/companionActions/taskActionStore";
import { clearPlanStores } from "@/lib/companionActions/planStore";

/** Remove private local work. With no kept account, clear the complete scope. */
export function clearPrivateAccountWork(
  queryClient: QueryClient,
  keepAccountId?: string | null,
) {
  clearTaskActionStores(keepAccountId);
  clearPlanStores(keepAccountId);
  clearComposerDrafts(keepAccountId);
  const otherAccount =
    (index: number) => (q: { queryKey: readonly unknown[] }) =>
      keepAccountId === undefined || q.queryKey[index] !== keepAccountId;
  for (const [queryKey, index] of [
    [TASKS_KEY, 2],
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
  ] as const) {
    const filters = { queryKey, predicate: otherAccount(index) };
    void queryClient.cancelQueries(filters);
    queryClient.removeQueries(filters);
  }
}
