"use client";

import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/Card";
import { useIsRtl } from "@/hooks/useDirection";
import { cn } from "@/lib/utils";
import { useModules } from "@/hooks/useLearn";
import { ModuleGridCard } from "@/components/learn/ModuleGridCard";

/**
 * Right-panel widget — a swipeable carousel of the user's in-progress learning
 * modules. Renders the exact same `ModuleGridCard` the Learn page uses (same
 * colour, blob, icon, title, completion ring) from the same `useModules()` data,
 * so each card is identical to its Learn counterpart and links straight to
 * `/learn/<moduleId>`.
 *
 * Native scroll-snap with `snap-always` (scroll-snap-stop: always) means a fast
 * swipe stops at the very next slide instead of flying past — no JS lock, so
 * consecutive swipes work freely.
 */
export function LearningProgressWidget() {
  const { t } = useTranslation();
  const isRtl = useIsRtl();
  const trackRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const { data } = useModules();
  const items = (data ?? []).filter((mod) => mod.status === "in_progress");

  function handleScroll() {
    const track = trackRef.current;
    if (!track) return;
    // In RTL, scrollLeft starts at 0 on the (right) start edge and goes negative
    // toward the end, so abs() yields the slide offset regardless of direction.
    setActiveIndex(Math.round(Math.abs(track.scrollLeft) / track.clientWidth));
  }

  function goToSlide(index: number) {
    const track = trackRef.current;
    if (!track) return;
    const offset = index * track.clientWidth;
    track.scrollTo({ left: isRtl ? -offset : offset, behavior: "smooth" });
  }

  if (items.length === 0) return null;

  return (
    <Card className="overflow-hidden p-0">
      <div
        ref={trackRef}
        onScroll={handleScroll}
        className="scrollbar-none flex snap-x snap-mandatory overflow-x-auto"
      >
        {items.map((mod) => (
          <div
            key={mod._id}
            className="w-full shrink-0 snap-start snap-always p-3"
          >
            <ModuleGridCard mod={mod} />
          </div>
        ))}
      </div>

      {items.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 pb-3.5">
          {items.map((mod, index) => (
            <button
              key={mod._id}
              type="button"
              onClick={() => goToSlide(index)}
              aria-label={t("home.showSlideAria", { title: mod.title })}
              className={cn(
                "h-1.5 w-1.5 cursor-pointer rounded-full transition-colors duration-150",
                index === activeIndex
                  ? "bg-ink-secondary"
                  : "bg-border-card hover:bg-ink-inactive",
              )}
            />
          ))}
        </div>
      )}
    </Card>
  );
}
