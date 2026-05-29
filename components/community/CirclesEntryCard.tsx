import { ArrowRight, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CircleStatus } from "@/types";

/**
 * `#f59d4a` is a CLAUDE.md-specified decorative colour for this card only —
 * component-locked, like the logo palette.
 */
const ELLIPSE_WARM = "#f59d4a";

const STATE_CONTENT: Record<
  CircleStatus,
  { title: string; description: string; cta: string }
> = {
  default: {
    title: "Unify Circles",
    description:
      "Get matched with 3 newcomers who share your background for a 2-week group chat.",
    cta: "Start Matching",
  },
  waiting: {
    title: "Looking for your circle",
    description:
      "We're finding 3 more newcomers who share your background for a 2-week group chat.",
    cta: "Hang tight!",
  },
  in_circle: {
    title: "Your circle is active",
    description:
      "You've been matched with 3 newcomers. Jump into the group chat and say hello.",
    cta: "Open circle chat",
  },
};

/** Orange gradient entry card for the Community → Unify Circles tab. */
export function CirclesEntryCard({
  status = "default",
  onStart,
  onCancel,
  isPending = false,
}: {
  status?: CircleStatus;
  onStart?: () => void;
  onCancel?: () => void;
  isPending?: boolean;
}) {
  const content = STATE_CONTENT[status];
  const isDefault = status === "default";
  const isWaiting = status === "waiting";
  const isInCircle = status === "in_circle";
  // Only "default" is actionable (start matching). "waiting" gets a separate
  // cancel control below; "in_circle" chat has no page yet, so its CTA is inert.
  const primaryDisabled = !isDefault || isPending;

  return (
    <div className="relative overflow-hidden rounded-card bg-primary p-6 shadow-sm">
      {/* Decorative ellipses */}
      <div
        className="pointer-events-none absolute -right-7 -top-9 h-28 w-28 rounded-full bg-primary-light"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-10 -left-8 h-28 w-28 rounded-full"
        style={{ backgroundColor: ELLIPSE_WARM }}
        aria-hidden
      />

      <div className="relative">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
          <Users className="h-5 w-5 text-white" aria-hidden />
        </span>
        <h3 className="mt-3 text-lg font-bold text-white">{content.title}</h3>
        <p className="mt-1 max-w-md text-sm leading-relaxed text-white/90">
          {content.description}
        </p>
        <button
          type="button"
          onClick={isDefault ? onStart : undefined}
          disabled={primaryDisabled}
          title={isInCircle ? "Chat coming soon" : undefined}
          className={cn(
            "mt-4 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2",
            "text-sm font-semibold text-primary transition-colors hover:bg-primary-bg",
            primaryDisabled ? "cursor-default opacity-70" : "cursor-pointer",
          )}
        >
          {isDefault && isPending ? "Starting…" : content.cta}
          {isDefault && !isPending && <ArrowRight className="h-4 w-4" aria-hidden />}
        </button>

        {isWaiting && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="mt-3 block text-xs font-medium text-white/80 underline underline-offset-2 transition-colors hover:text-white disabled:opacity-60"
          >
            Cancel matching
          </button>
        )}

        {isInCircle && (
          <p className="mt-2 text-xs text-white/70">Chat coming soon.</p>
        )}
      </div>
    </div>
  );
}
