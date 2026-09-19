"use client";

import { useEffect, useRef } from "react";
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
    let identifiedId: string | null = null;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      // supabase-js v2 emits INITIAL_SESSION on subscribe, so an already
      // signed-in user is identified on first load without a separate
      // getSession() call.
      const userId = session?.user?.id;
      if (userId) {
        posthog.identify(userId);
        // Enrich the person with onboarding persona + stage once per identity so
        // events can be segmented by persona (e.g. checklist usage by persona).
        // The onboarding row is own-row RLS, so this only reads the caller's own.
        if (userId !== identifiedId) {
          identifiedId = userId;
          const enrichmentUserId = userId;
          void supabase
            .from("user_onboarding_profiles")
            .select("persona, stage")
            .eq("id", enrichmentUserId)
            .maybeSingle()
            .then(({ data }) => {
              // Skip if the identity changed (sign-out / switch) while the
              // fetch was in flight — don't tag a new person with stale data.
              if (identifiedId !== enrichmentUserId) return;
              if (data) {
                posthog.setPersonProperties({
                  persona: data.persona,
                  stage: data.stage,
                });
              }
            });
        }
      } else {
        identifiedId = null;
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

  // Session recording is scoped to the resume + cover-letter features only
  // (recording is disabled globally in initPostHog). Start it while the user is
  // on those routes, stop it everywhere else, so we capture how those two AI
  // generators are actually used without recording the whole app.
  const onRecordedRoute =
    !!pathname &&
    (pathname.startsWith("/resume") || pathname.startsWith("/cover-letter"));
  useEffect(() => {
    if (!isPostHogConfigured() || typeof window === "undefined") return;
    if (onRecordedRoute) {
      posthog.startSessionRecording();
    } else {
      posthog.stopSessionRecording();
    }
  }, [onRecordedRoute]);

  // Best-effort: stop recording on navigation *intent* (a click on an internal
  // link) so PostHog can't capture a frame of the destination page's DOM before
  // the pathname effect above runs — that effect only fires after the new route
  // commits, and general (non-input) text isn't masked by default.
  //
  // This is best-effort, not watertight: it only catches link clicks. It won't
  // catch programmatic `router.push()` navigations, and browser back/forward
  // still relies on the pathname-based effect above as the fallback.
  const onRecordedRouteRef = useRef(onRecordedRoute);
  useEffect(() => {
    onRecordedRouteRef.current = onRecordedRoute;
  }, [onRecordedRoute]);
  useEffect(() => {
    if (!isPostHogConfigured() || typeof window === "undefined") return;
    function handleClickCapture(e: MouseEvent) {
      if (!onRecordedRouteRef.current) return;
      const target = e.target as Element | null;
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      // Next <Link> renders an <a href="/...">; only internal navigations count.
      const href = anchor?.getAttribute("href");
      if (!href || !href.startsWith("/")) return;
      posthog.stopSessionRecording();
    }
    // Capture phase so we run before the router's own click handler.
    document.addEventListener("click", handleClickCapture, true);
    return () =>
      document.removeEventListener("click", handleClickCapture, true);
  }, []);

  return <>{children}</>;
}
