"use client";

import { useAuthUser } from "@/hooks/useAuthUser";
import { noteAccount } from "@/lib/accountSession";

/**
 * The signed-in account id, or null; undefined while the session is read.
 * Also records it as the owner of new work (lib/accountSession.ts), so work
 * started for an earlier account is stopped before its next request or result.
 */
export function useAccountId(): string | null | undefined {
  const { data: user, isPending } = useAuthUser();
  if (isPending) return undefined;
  const id = user?.id ?? null;
  noteAccount(id);
  return id;
}
