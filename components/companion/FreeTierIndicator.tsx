"use client";
import { useTranslation } from "react-i18next";
import type { ChatbotUsage } from "@/types";

/** Availability comes from the server. Unknown never means a fresh allowance. */
export function FreeTierIndicator({ allowance }: { allowance?: ChatbotUsage }) {
  const { t, i18n } = useTranslation();
  return <p role="status" className="text-center text-xs text-ink-muted">
    {!allowance ? t("companion.allowanceUnavailable") : allowance.isPremium
      ? t("companion.allowancePremium")
      : t("companion.allowanceRemaining", { remaining: allowance.remaining,
          reset: new Date(allowance.resetsAt).toLocaleString(i18n.language, { timeZoneName: "short" }) })}
  </p>;
}
