"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  initPostHog,
  isPostHogConfigured,
  posthog,
  resetPostHog,
} from "@/lib/posthog";

/**
 * Boots PostHog on the client, ties the identified user to the Supabase auth
 * session, and captures a `$pageview` on every App Router route change. Mounted
 * at the root layout so it covers auth/onboarding routes as well as the
 * authenticated shell. A no-op when PostHog isn't configured.
 */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  // Initialize once on mount.
  useEffect(() => {
    initPostHog();
  }, []);

  // Identify the signed-in user; reset on sign-out. Mirrors the
  // `onAuthStateChange` subscription pattern in hooks/useAuthUser.ts.
  useEffect(() => {
    if (!isPostHogConfigured()) return;
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      // supabase-js v2 emits INITIAL_SESSION on subscribe, so an already
      // signed-in user is identified on first load without a separate
      // getSession() call.
      if (session?.user?.id) {
        posthog.identify(session.user.id);
      } else {
        resetPostHog();
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Capture a pageview on initial mount and every client-side navigation.
  const pathname = usePathname();
  useEffect(() => {
    if (!isPostHogConfigured() || typeof window === "undefined") return;
    posthog.capture("$pageview", { $current_url: window.location.href });
  }, [pathname]);

  return <>{children}</>;
}
