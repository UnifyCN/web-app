interface OverallProgressBarProps {
  completed: number;
  total: number;
}

/** Checklist header — overall completion across every priority section. */
export function OverallProgressBar({
  completed,
  total,
}: OverallProgressBarProps) {
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="rounded-card border border-border-card bg-surface p-4">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold text-ink-secondary">Your progress</span>
        <span className="text-ink-muted">
          {completed}/{total} complete · {percent}%
        </span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-input">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
