"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { clearPrivateAccountWork } from "@/lib/companion/clearPrivateAccountWork";

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
    clearPrivateAccountWork(queryClient, userId);
  }, [userId, ready, queryClient]);
}
