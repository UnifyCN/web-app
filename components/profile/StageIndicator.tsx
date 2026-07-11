"use client";

import { cn } from "@/lib/utils";
import { useStageLabel } from "@/lib/i18n/labels";
import type { Stage } from "@/types";

/** A 5-segment stepped bar showing the user's time-in-Canada stage. */
export function StageIndicator({ stage }: { stage: Stage }) {
  const stageLabel = useStageLabel();
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-1">
        {[0, 1, 2, 3, 4].map((segment) => (
          <span
            key={segment}
            className={cn(
              "h-1.5 w-5 rounded-full",
              segment <= stage ? "bg-primary" : "bg-surface-input",
            )}
          />
        ))}
      </div>
      <span className="text-xs font-medium text-ink-tertiary">
        {stageLabel(stage)}
      </span>
    </div>
  );
}
