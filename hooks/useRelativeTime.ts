"use client";

import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";

/**
 * Localized short relative timestamp: "Just now", "5m", "3h", "2d", then a
 * calendar date with the year once past a week. Uses `common.justNow` /
 * `minutesShort` / `hoursShort` / `daysShort`, and formats week-old dates with
 * Intl.DateTimeFormat in the active UI language (not a hardcoded en-CA). Used by
 * every list card and feed timestamp.
 */
export function useRelativeTime(): (iso: string) => string {
  const { t, i18n } = useTranslation();
  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    [i18n.language],
  );

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

      return dateFormat.format(date);
    },
    [t, dateFormat],
  );
}
