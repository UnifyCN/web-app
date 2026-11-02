"use client";

import { useEffect, useState } from "react";
import { formatLocalDate } from "@/lib/onboarding/arrivalCountdown";

/**
 * Today's local date. Re-read at local midnight and whenever the tab becomes
 * visible or focused again, so a day count rolls over on time (mobile re-reads
 * it on focus and on returning to the app). Keeps the same Date object while
 * the local day is unchanged, so memoised values don't recompute.
 */
export function useLocalToday(): Date {
  const [today, setToday] = useState(() => new Date());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      const now = new Date();
      setToday((prev) =>
        formatLocalDate(prev) === formatLocalDate(now) ? prev : now,
      );
      clearTimeout(timer);
      const nextMidnight = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
      );
      // A second past midnight, so the new day is certainly here.
      timer = setTimeout(refresh, nextMidnight.getTime() - now.getTime() + 1000);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return today;
}
