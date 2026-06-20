"use client";

import { useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
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
  const trackRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const { data } = useModules();
  const items = (data ?? []).filter((mod) => mod.status === "in_progress");

  function handleScroll() {
    const track = trackRef.current;
    if (!track) return;
    setActiveIndex(Math.round(track.scrollLeft / track.clientWidth));
  }

  function goToSlide(index: number) {
    const track = trackRef.current;
    if (!track) return;
    track.scrollTo({ left: index * track.clientWidth, behavior: "smooth" });
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
              aria-label={`Show ${mod.title}`}
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
