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
}: {
  status?: CircleStatus;
}) {
  const content = STATE_CONTENT[status];
  const isWaiting = status === "waiting";

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
          disabled={isWaiting}
          className={cn(
            "mt-4 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2",
            "text-sm font-semibold text-primary transition-colors hover:bg-primary-bg",
            isWaiting ? "cursor-default opacity-70" : "cursor-pointer",
          )}
        >
          {content.cta}
          {!isWaiting && <ArrowRight className="h-4 w-4" aria-hidden />}
        </button>
      </div>
    </div>
  );
}
