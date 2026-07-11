"use client";

import { ArrowRight, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { CircleStatus } from "@/types";

/**
 * `#f59d4a` is a CLAUDE.md-specified decorative colour for this card only —
 * component-locked, like the logo palette.
 */
const ELLIPSE_WARM = "#f59d4a";

const STATE_CONTENT: Record<
  CircleStatus,
  { titleKey: string; descriptionKey: string; ctaKey: string }
> = {
  default: {
    titleKey: "circles.title",
    descriptionKey: "circles.description",
    ctaKey: "circles.startMatching",
  },
  waiting: {
    titleKey: "circles.lookingForCircle",
    descriptionKey: "circles.findingNewcomers",
    ctaKey: "circles.hangTight",
  },
  in_circle: {
    titleKey: "circles.circleActive",
    descriptionKey: "circles.circleActiveDesc",
    ctaKey: "circles.openCircleChat",
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
  const { t } = useTranslation();
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
        <h3 className="mt-3 text-lg font-bold text-white">
          {t(content.titleKey)}
        </h3>
        <p className="mt-1 max-w-md text-sm leading-relaxed text-white/90">
          {t(content.descriptionKey)}
        </p>
        <button
          type="button"
          onClick={isDefault ? onStart : undefined}
          disabled={primaryDisabled}
          title={isInCircle ? t("circles.chatComingSoon") : undefined}
          className={cn(
            "mt-4 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2",
            "text-sm font-semibold text-primary transition-colors hover:bg-primary-bg",
            primaryDisabled ? "cursor-default opacity-70" : "cursor-pointer",
          )}
        >
          {isDefault && isPending ? t("circles.starting") : t(content.ctaKey)}
          {isDefault && !isPending && <ArrowRight className="h-4 w-4" aria-hidden />}
        </button>

        {isWaiting && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="mt-3 block text-xs font-medium text-white/80 underline underline-offset-2 transition-colors hover:text-white disabled:opacity-60"
          >
            {t("circles.cancelMatching")}
          </button>
        )}

        {isInCircle && (
          <p className="mt-2 text-xs text-white/70">
            {t("circles.chatComingSoon")}
          </p>
        )}
      </div>
    </div>
  );
}
