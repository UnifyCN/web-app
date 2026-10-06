"use client";

import { useState, useSyncExternalStore } from "react";

const subscribe = () => () => {};
const onClient = () => false;
const onServer = () => true;

/**
 * True for components that are part of the page as the server sent it, false
 * for ones that mount later: after in-app navigation, or when something new
 * appears on the page. Lets an entrance animation skip the first load, where
 * the server HTML should simply be visible.
 *
 * React itself answers the question: while it hydrates server HTML it reads the
 * server snapshot, and for anything it mounts fresh it reads the client one.
 * That holds for every part of the page, including a `<Suspense>` boundary that
 * hydrates late (the login form, which waits on `useSearchParams`), so the
 * first client render always matches the server's. The value is fixed for the
 * life of the component.
 */
export function useIsFirstLoad(): boolean {
  const hydrating = useSyncExternalStore(subscribe, onClient, onServer);
  const [isFirstLoad] = useState(hydrating);
  return isFirstLoad;
}
