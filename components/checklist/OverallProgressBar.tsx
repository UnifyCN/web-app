"use client";

import { useTranslation } from "react-i18next";
import { useIsRtl } from "@/hooks/useDirection";

interface OverallProgressBarProps {
  completed: number;
  total: number;
}

/** Checklist header — overall completion across every priority section. */
export function OverallProgressBar({
  completed,
  total,
}: OverallProgressBarProps) {
  const { t } = useTranslation();
  const isRtl = useIsRtl();
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="rounded-card border border-border-card bg-surface p-4">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold text-ink-secondary">
          {t("checklist.yourProgress")}
        </span>
        <span className="text-ink-muted">
          {t("checklist.progressSummary", { completed, total, percent })}
        </span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-input">
        {/* Full-width fill slid into view with a transform (no layout work per
            frame); the track clips it. It enters from the reading-start edge. */}
        <div
          className="h-full w-full rounded-full bg-primary transition-transform duration-[var(--motion-slow)] ease-out"
          style={{
            transform: `translateX(${isRtl ? 100 - percent : percent - 100}%)`,
          }}
        />
      </div>
    </div>
  );
}
