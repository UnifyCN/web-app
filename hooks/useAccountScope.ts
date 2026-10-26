"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { TASKS_KEY } from "@/hooks/useChecklist";
import { clearComposerDrafts } from "@/lib/companion/composerDrafts";
import { TASK_PROGRESS_ROOT } from "@/lib/companionActions/queryKeys";
import { clearTaskActionStores } from "@/lib/companionActions/taskActionStore";

/**
 * Keeps private Companion and Checklist work owned by one account (mobile-app#361).
 * Checklist and task-progress queries carry the account id in their keys, so a
 * view never reads another account's entry; this removes those entries, unsent
 * messages and unresolved task actions of every other account once the signed-in
 * account changes or signs out.
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
  }, [userId, ready, queryClient]);
}
