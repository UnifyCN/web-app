"use client";

import { useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import { useLearningProgressSummary } from "@/hooks/useLearn";

/**
 * Right-panel widget — a swipeable carousel of in-progress learning modules.
 *
 * Native scroll-snap with `snap-always` (scroll-snap-stop: always) means a
 * fast swipe stops at the very next slide instead of flying past — no JS
 * lock, so consecutive swipes work freely.
 */
export function LearningProgressWidget() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const { data } = useLearningProgressSummary();
  const items = data ?? [];

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
        {items.map((item) => {
          const percent = Math.max(0, Math.min(100, item.progressPercent));
          return (
            <div
              key={item.moduleId}
              className="w-full shrink-0 snap-start snap-always"
            >
              <div
                className="relative aspect-[16/7] w-full"
                style={{
                  backgroundColor:
                    item.colorHex ?? "var(--color-ink-placeholder)",
                }}
              />

              <div className="p-4">
                <h3 className="text-sm font-semibold text-ink-secondary">
                  Learning Progress
                </h3>
                <p className="mt-0.5 text-xs text-ink-placeholder">
                  {item.moduleName}
                </p>
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-ink-muted">Completion</span>
                    <span className="font-semibold text-ink-secondary">
                      {percent}%
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-input">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {items.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 pb-3.5">
          {items.map((item, index) => (
            <button
              key={item.moduleId}
              type="button"
              onClick={() => goToSlide(index)}
              aria-label={`Show ${item.moduleName}`}
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
