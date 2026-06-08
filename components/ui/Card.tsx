import { cn } from "@/lib/utils";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Adds a pointer cursor + hover elevation for clickable cards. */
  interactive?: boolean;
}

/** Brand surface card — warm off-white, soft border, subtle shadow. */
export function Card({
  interactive = false,
  className,
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        "rounded-card border border-border-card bg-surface-card p-4 shadow-sm",
        interactive &&
          "cursor-pointer transition-all duration-200 hover:shadow-md",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
