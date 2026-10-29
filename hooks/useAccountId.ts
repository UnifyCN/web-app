"use client";

import { useSyncExternalStore } from "react";
import { useAuthUser } from "@/hooks/useAuthUser";
import {
  accountEpoch,
  noteAccount,
  subscribeAccountEpoch,
} from "@/lib/accountSession";

/**
 * The signed-in account id, or null; undefined while the session is read.
 * Also records it as the owner of new work (lib/accountSession.ts), so work
 * started for an earlier account is stopped before its next request or result.
 */
export function useAccountId(): string | null | undefined {
  useSyncExternalStore(subscribeAccountEpoch, accountEpoch, () => 0);
  const { data: user, isPending } = useAuthUser();
  if (isPending) return undefined;
  const id = user?.id ?? null;
  noteAccount(id);
  return id;
}

/**
 * Counts changes of the signed-in account: another account or a sign-out. The
 * first load of the session and a token refresh are not changes. Account-owned
 * UI keyed on it remounts empty, so a new account never sees the previous
 * account's unsent text, errors or pending sends (mobile-app#361).
 */
export function useAccountGeneration(): number {
  const accountId = useAccountId();
  return accountId === undefined ? 0 : accountEpoch();
}
