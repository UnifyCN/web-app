"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import { learningProgress } from "@/lib/mock/progress";

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

  return (
    <Card className="overflow-hidden p-0">
      <div
        ref={trackRef}
        onScroll={handleScroll}
        className="scrollbar-none flex snap-x snap-mandatory overflow-x-auto"
      >
        {learningProgress.map((item) => (
          <div
            key={item.id}
            className="w-full shrink-0 snap-start snap-always"
          >
            <div className="relative aspect-[16/7] w-full">
              <Image
                src={item.bannerUrl}
                alt=""
                fill
                className="object-cover"
                sizes="320px"
              />
            </div>
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
                    {item.progressPercent}%
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-input">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${item.progressPercent}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-center gap-1.5 pb-3.5">
        {learningProgress.map((item, index) => (
          <button
            key={item.id}
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
    </Card>
  );
}
