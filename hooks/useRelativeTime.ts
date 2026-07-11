"use client";

import { useCallback } from "react";
import { useTranslation } from "react-i18next";

/**
 * Localized short relative timestamp — the i18n-aware version of
 * `formatRelativeTime` in lib/utils.ts (which stays English for
 * not-yet-translated callers). Uses `common.justNow` / `minutesShort` /
 * `hoursShort` / `daysShort`, and formats week-old dates with the active UI
 * language instead of hardcoded en-CA.
 */
export function useRelativeTime(): (iso: string) => string {
  const { t, i18n } = useTranslation();

  return useCallback(
    (iso: string) => {
      const date = new Date(iso);
      const now = new Date();
      const diffSec = Math.round((now.getTime() - date.getTime()) / 1000);

      if (diffSec < 60) return t("common.justNow");
      const diffMin = Math.round(diffSec / 60);
      if (diffMin < 60) return t("common.minutesShort", { count: diffMin });
      const diffHr = Math.round(diffMin / 60);
      if (diffHr < 24) return t("common.hoursShort", { count: diffHr });
      const diffDay = Math.round(diffHr / 24);
      if (diffDay < 7) return t("common.daysShort", { count: diffDay });

      return date.toLocaleDateString(i18n.language, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    },
    [t, i18n.language],
  );
}
