"use client";

import { useEffect, useState } from "react";

// Flips once the app has mounted in this tab; module scope, so it survives
// client-side navigation and resets only on a full page load.
let appHasMounted = false;

/**
 * True for components that mount as part of the initial page load, false for
 * ones that mount later through in-app navigation. Lets an entrance animation
 * skip the first load, where the server HTML should simply be visible. The
 * value is fixed for the life of the component, and it is `true` on the server
 * and during hydration, so the two renders match.
 */
export function useIsFirstLoad(): boolean {
  const [isFirstLoad] = useState(() => !appHasMounted);
  useEffect(() => {
    appHasMounted = true;
  }, []);
  return isFirstLoad;
}
