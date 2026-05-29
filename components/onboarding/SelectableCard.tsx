import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface SelectableCardProps {
  selected: boolean;
  onToggle: () => void;
  label: string;
  description?: string;
  icon?: React.ReactNode;
}

/**
 * A toggleable option card — used for persona (single) and goals / interests
 * (multi). The check badge keeps a stable footprint whether selected or not.
 */
export function SelectableCard({
  selected,
  onToggle,
  label,
  description,
  icon,
}: SelectableCardProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-start gap-3 rounded-card border p-4 text-left",
        "cursor-pointer transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        selected
          ? "border-primary bg-primary-bg"
          : "border-border-card bg-surface hover:bg-surface-gray",
      )}
    >
      {icon && (
        <span
          className={cn(
            "mt-0.5 shrink-0",
            selected ? "text-primary" : "text-ink-placeholder",
          )}
          aria-hidden
        >
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block text-sm font-semibold",
            selected ? "text-primary" : "text-ink-secondary",
          )}
        >
          {label}
        </span>
        {description && (
          <span className="mt-0.5 block text-xs text-ink-muted">
            {description}
          </span>
        )}
      </span>
      <span
        className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors duration-150",
          selected
            ? "border-primary bg-primary text-white"
            : "border-border-card text-transparent",
        )}
        aria-hidden
      >
        <Check className="h-3.5 w-3.5" />
      </span>
    </button>
  );
}
