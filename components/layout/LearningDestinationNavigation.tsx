"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const ACKNOWLEDGED_INTENT = "unify_learning_navigation";
const SETUP_PATHS = new Set([
  "/welcome", "/login", "/signup", "/verify-email", "/forgot-password",
  "/reset-password", "/before-you-continue", "/onboarding",
]);

/** Prefetched Flight payloads never mount this component or acknowledge intent. */
export function LearningDestinationNavigation() {
  const pathname = usePathname();
  const initialPathname = useRef(pathname);
  const hasNavigated = useRef(false);
  useEffect(() => {
    if (pathname !== initialPathname.current) hasNavigated.current = true;
    // Proxy already committed an initial document request. An old tab must not
    // acknowledge a new intent created elsewhere while that page hydrates.
    // Mounted in the root layout so this survives auth/main route-group changes.
    if (!hasNavigated.current || SETUP_PATHS.has(pathname) || pathname.startsWith("/auth")) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/learning-destination", {
          cache: "no-store", credentials: "same-origin", signal: controller.signal,
        });
        if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) return;
        const { intent } = await response.json();
        if (controller.signal.aborted || window.location.pathname !== pathname) return;
        if (!intent) {
          sessionStorage.removeItem(ACKNOWLEDGED_INTENT);
          return;
        }
        if (typeof intent !== "string") return;
        const acknowledgement = JSON.stringify([intent, pathname]);
        // The gates deliberately fail open on DB outages. Avoid a reload loop
        // if that document request cannot yet consume the pending destination.
        if (sessionStorage.getItem(ACKNOWLEDGED_INTENT) === acknowledgement) return;
        sessionStorage.setItem(ACKNOWLEDGED_INTENT, acknowledgement);
        window.location.replace(window.location.href);
      } catch {
        // An aborted navigation, unavailable storage or failed read leaves the
        // server-owned intent untouched for a later document navigation.
      }
    })();
    return () => controller.abort();
  }, [pathname]);
  return null;
}
