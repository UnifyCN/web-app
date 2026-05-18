import { cn } from "@/lib/utils";

type BadgeVariant = "primary" | "neutral" | "outline";

interface BadgeProps {
  /** primary = orange group pill; neutral = gray; outline = bordered. */
  variant?: BadgeVariant;
  leftIcon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

const VARIANTS: Record<BadgeVariant, string> = {
  primary: "bg-primary-bg text-primary",
  neutral: "bg-surface-gray text-ink-tertiary",
  outline: "border border-border-card text-ink-muted",
};

/** Small pill label — group badges, category tags, event types. */
export function Badge({
  variant = "primary",
  leftIcon,
  className,
  children,
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5",
        "text-xs font-medium",
        VARIANTS[variant],
        className,
      )}
    >
      {leftIcon}
      {children}
    </span>
  );
}
