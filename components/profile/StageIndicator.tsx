import { cn } from "@/lib/utils";
import type { Stage } from "@/types";

const STAGE_LABEL: Record<Stage, string> = {
  0: "Not arrived yet",
  1: "0–3 months in Canada",
  2: "3–12 months in Canada",
  3: "1–3 years in Canada",
  4: "3+ years in Canada",
};

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
