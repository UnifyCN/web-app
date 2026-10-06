"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useCurrentUser } from "@/hooks/useProfile";
import { PREFETCHABLE_TABS, usePrefetchTab } from "@/hooks/usePrefetchTab";

// Once per page load is enough: after that the data is in the cache and each
// tab keeps itself fresh.
let warmedThisLoad = false;

interface NetworkInformation {
  saveData?: boolean;
  effectiveType?: string;
}

/** True when the device asked to save data or is on a very slow connection. */
function shouldSaveData(): boolean {
  const connection = (navigator as Navigator & { connection?: NetworkInformation })
    .connection;
  if (!connection) return false;
  return (
    connection.saveData === true ||
    connection.effectiveType === "slow-2g" ||
    connection.effectiveType === "2g"
  );
}

/**
 * Warms the other main tabs' data once the current page has settled, so the
 * first visit to each one shows content right away. It waits for the browser
 * to be idle and fetches one tab at a time, so it never competes with the page
 * the user is looking at. Skipped entirely on Save-Data or 2G connections,
 * where the tabs still warm on hover / focus / touch (see the nav components).
 * Renders nothing.
 */
export function TabPrefetcher() {
  const pathname = usePathname();
  const prefetchTab = usePrefetchTab();
  const { data: currentUser } = useCurrentUser();
  const signedIn = Boolean(currentUser?.id);

  useEffect(() => {
    if (!signedIn) {
      // Signed out: the next account to sign in gets its own warm-up.
      warmedThisLoad = false;
      return;
    }
    if (warmedThisLoad || shouldSaveData()) return;
    warmedThisLoad = true;

    let cancelled = false;
    let started = false;
    const warm = async () => {
      started = true;
      for (const href of PREFETCHABLE_TABS) {
        if (cancelled) return;
        // The page the user is on fetches its own data.
        if (pathname === href || pathname.startsWith(`${href}/`)) continue;
        await prefetchTab(href);
      }
    };

    const idle = window.requestIdleCallback
      ? window.requestIdleCallback(() => void warm(), { timeout: 4000 })
      : window.setTimeout(() => void warm(), 1500);

    return () => {
      cancelled = true;
      // Cancelled before it began: let the next run schedule it again.
      if (!started) warmedThisLoad = false;
      if (window.cancelIdleCallback) window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
    };
    // Runs once per load, when the session is known; later route changes must
    // not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn]);

  return null;
}
