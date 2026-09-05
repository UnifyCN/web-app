"use client";

import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * Tappable example-answer chips for the cover-letter chat. Like the resume's,
 * these FILL the input with an editable suggestion (they do not auto-send).
 */
export function CoverLetterSuggestionChips({
  suggestions,
  onPick,
}: {
  suggestions: string[];
  onPick: (text: string) => void;
}) {
  const { t } = useTranslation();
  const items = suggestions.filter((s) => s.trim());
  if (items.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1 text-[11px] font-medium text-ink-placeholder">
        <Sparkles className="h-3 w-3" aria-hidden />
        {t("coverLetter.suggestionsHint")}
      </p>
      <div className="flex flex-wrap gap-2">
        {items.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="cursor-pointer rounded-full border border-primary/40 bg-primary-bg px-3 py-1.5 text-start text-xs text-primary-dark transition-colors hover:bg-primary/10"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
