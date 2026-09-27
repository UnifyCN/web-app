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
    // Back/forward can restore this page from the bfcache with the email still
    // rendered — e.g. after a sign-out cleared it on a shared computer. Re-read.
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setEmail(takeAuthEmail(flow));
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [flow]);

  return { email: email ?? "", resolved: email !== null };
}
