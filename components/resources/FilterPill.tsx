import { cn } from "@/lib/utils";

/**
 * Outlined pill from the Resources frames (filter options, preference pills,
 * eligibility tags). Interactive when `onClick` is set (a toggle with
 * aria-pressed); otherwise a static label.
 */
export function FilterPill({
  label,
  selected = false,
  onClick,
}: {
  label: string;
  selected?: boolean;
  onClick?: () => void;
}) {
  const className = cn(
    "inline-flex items-center rounded-full border-[0.75px] px-[9.75px] py-[4.5px] text-center text-[11.5px] leading-tight font-bold",
    selected
      ? "border-res-link bg-res-free-bg text-res-link"
      : "border-res-outline bg-surface text-res-secondary",
  );

  if (!onClick) return <span className={className}>{label}</span>;

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        className,
        "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-res-link focus-visible:ring-offset-1",
        !selected && "hover:border-res-secondary hover:text-res-card-text",
      )}
    >
      {label}
    </button>
  );
}
