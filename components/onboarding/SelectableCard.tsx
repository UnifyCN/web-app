import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Token-only pastel themes for the "select all that apply" steps (goals,
 * interests, hobbies) — mirrors the mobile app's multicolour chips. Orange is
 * deliberately excluded so a resting chip can't be mistaken for the selected
 * state (selected = solid brand orange). All values come from existing
 * design tokens; no new hex.
 */
export const CARD_COLORS = ["amber", "blue", "green", "pink", "peach"] as const;

export type CardColor = (typeof CARD_COLORS)[number];

const CARD_COLOR_CLASS: Record<CardColor, { bg: string; fg: string }> = {
  amber: { bg: "bg-priority-explore-bg", fg: "text-priority-explore" },
  blue: { bg: "bg-mention-blue/10", fg: "text-mention-blue" },
  green: { bg: "bg-priority-optional-bg", fg: "text-priority-optional" },
  pink: { bg: "bg-priority-do-now-bg", fg: "text-priority-do-now" },
  peach: { bg: "bg-priority-do-soon-bg", fg: "text-priority-do-soon" },
};

interface SelectableCardProps {
  selected: boolean;
  onToggle: () => void;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  /** Pastel theme for multi-select chips. Omit for the plain orange card. */
  color?: CardColor;
}

/**
 * A toggleable option card — used for persona (single) and goals / interests /
 * hobbies (multi). Without `color` it's the plain card (white → light-orange
 * selected). With `color` it's a mobile-style coloured chip: a pastel resting
 * state and a solid-orange selected state with a white check.
 */
export function SelectableCard({
  selected,
  onToggle,
  label,
  description,
  icon,
  color,
}: SelectableCardProps) {
  const theme = color ? CARD_COLOR_CLASS[color] : null;

  // Foreground colour shared by icon + label, per state.
  const fg = selected
    ? theme
      ? "text-white"
      : "text-primary"
    : theme
      ? theme.fg
      : null;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-start gap-3 rounded-card border p-4 text-left shadow-sm",
        "cursor-pointer transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        selected
          ? theme
            ? "border-primary bg-primary"
            : "border-primary bg-primary-bg"
          : theme
            ? cn("border-transparent", theme.bg)
            : "border-border-card bg-surface hover:bg-surface-gray",
      )}
    >
      {icon && (
        <span
          className={cn(
            "mt-0.5 shrink-0",
            fg ?? (selected ? "text-primary" : "text-ink-placeholder"),
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
            fg ?? (selected ? "text-primary" : "text-ink-secondary"),
          )}
        >
          {label}
        </span>
        {description && (
          <span
            className={cn(
              "mt-0.5 block text-xs",
              selected && theme ? "text-white/80" : "text-ink-muted",
            )}
          >
            {description}
          </span>
        )}
      </span>
      {/* Coloured chips show no empty circle when unselected (mobile style). */}
      {(!theme || selected) && (
        <span
          className={cn(
            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors duration-150",
            selected
              ? theme
                ? "border-white bg-white text-primary"
                : "border-primary bg-primary text-white"
              : "border-border-card text-transparent",
          )}
          aria-hidden
        >
          <Check className="h-3.5 w-3.5" />
        </span>
      )}
    </button>
  );
}
