"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Whether a CSS media query matches. Returns `serverDefault` during SSR and
 * hydration, then tracks the query live.
 */
export function useMediaQuery(query: string, serverDefault = false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => serverDefault,
  );
}
