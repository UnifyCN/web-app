import { cn } from "@/lib/utils";

/** Segmented progress bar across the wizard's steps. */
export function StepProgress({
  current,
  total,
}: {
  current: number;
  total: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-1 gap-1.5">
        {[...Array(total).keys()].map((i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors duration-150",
              i <= current ? "bg-primary" : "bg-surface-input",
            )}
          />
        ))}
      </div>
      <span className="shrink-0 text-xs font-medium text-ink-placeholder">
        {current + 1}/{total}
      </span>
    </div>
  );
}
