"use client";

import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

interface QuizProgressBarProps {
  sectionNumber: number;
  title: string;
  /** 0–100. */
  percent: number;
  colorHex: string;
  onClose: () => void;
}

/** Six-digit hex → an `rgba()`-equivalent gradient stop; otherwise the color
 * as-is (e.g. a CSS var fallback). */
function fillStyle(colorHex: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(colorHex)
    ? `linear-gradient(90deg, ${colorHex}8C, ${colorHex})`
    : colorHex;
}

export function QuizProgressBar({
  sectionNumber,
  title,
  percent,
  colorHex,
  onClose,
}: QuizProgressBarProps) {
  const { t } = useTranslation();
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="mb-7">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onClose}
          aria-label={t("learnWeb.practice.closeQuizAria")}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-placeholder transition-colors hover:bg-surface-gray hover:text-ink"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
        <h1 className="line-clamp-2 flex-1 text-center text-base font-semibold text-ink-secondary">
          {t("learnWeb.practice.sectionTitle", {
            number: sectionNumber,
            title,
          })}
        </h1>
        <span className="h-9 w-9 shrink-0" aria-hidden />
      </div>
      <div
        className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-input"
        role="progressbar"
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full transition-all duration-300 ease-out"
          style={{ width: `${clamped}%`, background: fillStyle(colorHex) }}
        />
      </div>
    </div>
  );
}
