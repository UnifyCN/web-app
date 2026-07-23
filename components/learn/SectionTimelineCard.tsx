import Link from "next/link";
import { ArrowRight, Check, Lock, type LucideIcon } from "lucide-react";
import { cn, RTL_FLIP } from "@/lib/utils";

export type SectionCardDot = "completed" | "active" | "todo" | "locked";

interface SectionTimelineCardProps {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  colorHex: string;
  /** Colored CTA treatment (the section's next action). */
  isActive: boolean;
  /** Muted + non-interactive (e.g. Practice before Learn is started). */
  locked?: boolean;
  /** Sub-label shown under the title when locked. */
  lockedHint?: string;
  /** Button text (Start / Continue / Resume / Review). Omit for no button. */
  buttonLabel?: string;
  /** Where the card/button navigates (ignored when locked). */
  href?: string;
  dot: SectionCardDot;
  isFirst: boolean;
  isLast: boolean;
}

/**
 * One row of the section "activities" timeline (Learn / Practice): a vertical
 * connector + dot on the left, a card on the right. The active card gets the
 * module-colour CTA treatment.
 */
export function SectionTimelineCard({
  icon: Icon,
  title,
  subtitle,
  colorHex,
  isActive,
  locked = false,
  lockedHint,
  buttonLabel,
  href,
  dot,
  isFirst,
  isLast,
}: SectionTimelineCardProps) {
  const dotFilled = dot === "completed";
  // Coloured (module-colour) treatment applies to both the current action AND
  // already-completed cards — only `todo`/`locked` cards stay plain white.
  const colored = isActive || dot === "completed";
  const railColor =
    dot === "completed" || dot === "active"
      ? colorHex
      : "var(--color-border-card)";
  const railDashed = dot !== "completed";

  const cardInner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3
            className={cn(
              "text-base font-bold",
              colored ? "text-white" : "text-ink-secondary",
            )}
          >
            {title}
          </h3>
          <p
            className={cn(
              "mt-0.5 text-xs",
              colored ? "text-white/85" : "text-ink-muted",
            )}
          >
            {locked && lockedHint ? lockedHint : subtitle}
          </p>
        </div>
        {locked ? (
          <Lock className="h-5 w-5 shrink-0 text-ink-placeholder" aria-hidden />
        ) : (
          <Icon
            className={cn(
              "h-5 w-5 shrink-0",
              colored ? "text-white" : "text-ink-placeholder",
            )}
            strokeWidth={1.75}
            aria-hidden
          />
        )}
      </div>

      {buttonLabel && !locked && (
        <span
          className={cn(
            "mt-3 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-md text-sm font-semibold transition-colors",
            colored
              ? "bg-white hover:bg-surface-gray"
              : "bg-surface-gray text-ink-secondary hover:bg-surface-input",
          )}
          style={colored ? { color: colorHex } : undefined}
        >
          {buttonLabel}
          <ArrowRight className={cn("h-4 w-4", RTL_FLIP)} aria-hidden />
        </span>
      )}
    </>
  );

  return (
    <li className="relative flex items-stretch gap-4">
      {/* Timeline rail */}
      <div className="relative flex w-6 flex-col items-center">
        <span
          aria-hidden
          className={cn(
            "w-0.5 grow border-s-2",
            isFirst && "invisible",
            railDashed ? "border-dashed" : "border-solid",
          )}
          style={{ borderColor: railColor, opacity: railDashed ? 0.45 : 1 }}
        />
        <span
          className={cn(
            "my-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
            dotFilled && "border-transparent",
          )}
          style={{
            borderColor: dotFilled ? "transparent" : railColor,
            backgroundColor: dotFilled ? colorHex : "var(--color-surface)",
          }}
        >
          {dotFilled && (
            <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} aria-hidden />
          )}
        </span>
        <span
          aria-hidden
          className={cn(
            "w-0.5 grow border-s-2",
            isLast && "invisible",
            railDashed ? "border-dashed" : "border-solid",
          )}
          style={{ borderColor: railColor, opacity: railDashed ? 0.45 : 1 }}
        />
      </div>

      {/* Card */}
      {!locked && href ? (
        <Link
          href={href}
          className={cn(
            "my-1.5 flex flex-1 flex-col rounded-card border p-4 transition-colors",
            colored
              ? "border-transparent shadow-sm"
              : "border-border-card bg-surface hover:bg-surface-card",
          )}
          style={colored ? { backgroundColor: colorHex } : undefined}
        >
          {cardInner}
        </Link>
      ) : (
        <div
          className={cn(
            "my-1.5 flex flex-1 flex-col rounded-card border p-4",
            locked
              ? "border-border-card bg-surface-card opacity-70"
              : colored
                ? "border-transparent shadow-sm"
                : "border-border-card bg-surface",
          )}
          style={!locked && colored ? { backgroundColor: colorHex } : undefined}
          aria-disabled={locked || undefined}
        >
          {cardInner}
        </div>
      )}
    </li>
  );
}
