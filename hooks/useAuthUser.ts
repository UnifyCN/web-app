"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { getAuthUser } from "@/services/auth";

/** The authenticated Supabase user (auth.users), or null when signed out. */
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
    queryFn: async () => {
      const { user } = await getAuthUser();
      return user;
    },
  });
}
