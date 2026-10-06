"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { getSessionUser } from "@/services/auth";

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
    } = supabase.auth.onAuthStateChange(() => {
      queryClient.invalidateQueries({ queryKey: AUTH_USER_KEY });
    });
    return () => subscription.unsubscribe();
  }, [queryClient]);

  return useQuery({
    queryKey: AUTH_USER_KEY,
    queryFn: getSessionUser,
  });
}
