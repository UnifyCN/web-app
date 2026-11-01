"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { getSessionUser } from "@/services/auth";
import { noteAccount, ownAccountWork } from "@/lib/accountSession";
import { clearPrivateAccountWork } from "@/lib/companion/clearPrivateAccountWork";

/**
 * The signed-in Supabase user (auth.users), or null when signed out. Read from
 * the stored session, so it costs no request: this hook is mounted on every
 * page, and a network user check here made all page data wait behind it. The
 * subscription below refreshes it whenever the session changes (sign-in,
 * sign-out, an email change), so it does not go stale.
 */
export const AUTH_USER_KEY = ["auth-user"] as const;

export function useAuthUser() {
  const queryClient = useQueryClient();

  // onAuthStateChange is a subscription, not a one-shot call, so it stays on
  // the client directly. The services layer exposes one-shot calls only.
  useEffect(() => {
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const accountId = session?.user.id ?? null;
      const previousOwner = ownAccountWork();
      // Publish the event's user before epoch subscribers render. An equal
      // final query result must not hide a session reset, or restore old data.
      void queryClient.cancelQueries({ queryKey: AUTH_USER_KEY });
      queryClient.setQueryData(AUTH_USER_KEY, session?.user ?? null);
      // Work in flight for an earlier account stops at once (#361).
      noteAccount(accountId);
      if (previousOwner.accountId !== accountId) {
        // The first confirmation keeps only new input from the unresolved
        // session. A real account reset advances the epoch and keeps none.
        const firstConfirmation =
          previousOwner.accountId === null &&
          accountId !== null &&
          previousOwner.epoch === ownAccountWork().epoch;
        clearPrivateAccountWork(
          queryClient,
          undefined,
          firstConfirmation ? previousOwner : undefined,
        );
      }
      queryClient.invalidateQueries({ queryKey: AUTH_USER_KEY });
    });
    return () => subscription.unsubscribe();
  }, [queryClient]);

  return useQuery({
    queryKey: AUTH_USER_KEY,
    queryFn: getSessionUser,
  });
}
