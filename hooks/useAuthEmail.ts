"use client";

import { useEffect, useState } from "react";
import { takeAuthEmail, type AuthEmailFlow } from "@/lib/authEmailHandoff";

/**
 * The email handed to /verify-email or /reset-password via `sessionStorage`
 * (see `lib/authEmailHandoff.ts`). Resolved after mount — storage and the URL
 * aren't readable during SSR — so `resolved` is false on the first render.
 * `email` is "" when nothing was handed over (new tab, other device, private
 * window, cleared storage); the page then asks for it.
 */
export function useAuthEmail(flow: AuthEmailFlow) {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration-safe one-time storage/URL read; runs once on mount
    setEmail(takeAuthEmail(flow));
  }, [flow]);

  return { email: email ?? "", resolved: email !== null };
}
