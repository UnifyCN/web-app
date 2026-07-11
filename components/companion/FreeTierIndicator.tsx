"use client";

import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

/** Small free-tier usage line shown near the chat input. */
export function FreeTierIndicator({ remaining }: { remaining: number }) {
  const { t } = useTranslation();
  return (
    <p className="flex items-center justify-center gap-1 text-xs text-ink-placeholder">
      <Sparkles className="h-3 w-3" aria-hidden />
      {t("companion.messagesPerDayRemaining", { count: remaining })}
    </p>
  );
}
