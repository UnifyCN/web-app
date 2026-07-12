"use client";

import { useState } from "react";
import { Languages, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useContentTranslation } from "@/hooks/useTranslations";
import {
  TranslationLimitError,
  type TranslatableType,
} from "@/services/translations";
import { DEFAULT_LANGUAGE } from "@/lib/i18n/config";
import { cn, stripHtml } from "@/lib/utils";

/**
 * On-demand Translate affordance for user-generated content (i18n Phase 3).
 * Renders both the trigger and the inline translation block, so callers drop
 * a single element below the original content: idle "Translate" link →
 * spinner → translated title/body shown *under* the original with a
 * "Machine translated · Show original" footer. Hidden entirely when the UI
 * language is English. Re-showing a collapsed translation reuses the TanStack
 * cache (no network, no quota); analytics fire inside the hook's queryFn.
 */
export function TranslateButton({
  type,
  id,
  className,
}: {
  type: TranslatableType;
  id: number | string;
  className?: string;
}) {
  const { t } = useTranslation();
  const [showTranslation, setShowTranslation] = useState(false);
  const { translate, translation, isTranslating, error, targetLanguage } =
    useContentTranslation(type, id);

  if (targetLanguage === DEFAULT_LANGUAGE) return null;

  function handleTranslate() {
    // Already in the TanStack cache → instant re-show, no refetch (a refetch
    // would hit the network and spend quota even with cached data).
    if (!translation) void translate();
    setShowTranslation(true);
  }

  if (translation && showTranslation) {
    return (
      <div className={className}>
        {type === "post" && translation.translatedTitle && (
          <h4 className="text-sm font-semibold text-ink-secondary">
            {stripHtml(translation.translatedTitle)}
          </h4>
        )}
        <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-muted">
          {stripHtml(translation.translatedContent)}
        </p>
        <div className="mt-1 flex items-center gap-1.5 text-xs text-ink-placeholder">
          <span>{t("translate.machineTranslated")}</span>
          <span aria-hidden>·</span>
          <button
            type="button"
            onClick={() => setShowTranslation(false)}
            className="cursor-pointer font-medium text-primary hover:underline"
          >
            {t("translate.showOriginal")}
          </button>
        </div>
      </div>
    );
  }

  if (isTranslating) {
    return (
      <span
        className={cn(
          "flex items-center gap-1.5 text-xs font-medium text-ink-muted",
          className,
        )}
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        {t("translate.translating")}
      </span>
    );
  }

  if (error) {
    if (error instanceof TranslationLimitError) {
      return (
        <p className={cn("text-xs text-ink-placeholder", className)}>
          {t("translate.limitReached")}
        </p>
      );
    }
    return (
      <button
        type="button"
        onClick={() => void translate()}
        className={cn(
          "flex cursor-pointer items-center gap-1.5 text-xs font-medium text-primary hover:underline",
          className,
        )}
      >
        <Languages className="h-3.5 w-3.5" aria-hidden />
        {t("translate.unavailable")}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleTranslate}
      className={cn(
        "flex cursor-pointer items-center gap-1.5 text-xs font-medium text-primary hover:underline",
        className,
      )}
    >
      <Languages className="h-3.5 w-3.5" aria-hidden />
      {t("translate.button")}
    </button>
  );
}
