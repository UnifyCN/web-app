import { cn } from "@/lib/utils";
import { STAGE_LABEL } from "@/lib/onboarding/constants";
import type { Stage } from "@/types";

/** A 5-segment stepped bar showing the user's time-in-Canada stage. */
export function StageIndicator({ stage }: { stage: Stage }) {
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
        {STAGE_LABEL[stage]}
      </span>
    </div>
  );
}
