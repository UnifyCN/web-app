"use client";

import { ChevronDown, Globe } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLanguage } from "@/hooks/useLanguage";
import { type SupportedLanguage } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

/**
 * UI-language selector — a native <select> (accessible, keyboard-friendly, no
 * dialog) styled with brand tokens and framed by a globe + chevron. Used in
 * Settings and on the signed-out welcome screen. Changing it applies the
 * language instantly and best-effort-syncs to the shared DB via useLanguage().
 */
export function LanguagePicker({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { currentLanguage, changeLanguage, supportedLanguages } = useLanguage();

  return (
    <div className={cn("relative inline-flex items-center", className)}>
      <Globe
        className="pointer-events-none absolute left-3 h-4 w-4 text-ink-muted"
        aria-hidden
      />
      <select
        aria-label={t("language.selectLanguage")}
        value={currentLanguage}
        onChange={(e) =>
          void changeLanguage(e.target.value as SupportedLanguage)
        }
        className="w-full appearance-none rounded-full border border-border-card bg-surface py-2 pl-9 pr-9 text-sm font-medium text-ink-secondary transition-colors hover:bg-surface-gray focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
      >
        {(
          Object.entries(supportedLanguages) as [SupportedLanguage, string][]
        ).map(([code, label]) => (
          <option key={code} value={code}>
            {label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 h-4 w-4 text-ink-muted"
        aria-hidden
      />
    </div>
  );
}
