"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { DURATION, ENTER, EXIT } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Skeleton → content, as a crossfade in place: the skeleton fades out while
 * the content fades in over the same grid cell, so nothing jumps. Opacity
 * only. When the data is already there on first render (a cached revisit),
 * the content is simply shown, with no fade. The same goes for data that lands
 * while the page itself is still fading in: a second fade on top of the page
 * change would read as a flicker, so the swap is instant until that has passed.
 */
export function LoadingSwap({
  loading,
  skeleton,
  className,
  children,
}: {
  loading: boolean;
  skeleton: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  // False while the page change that mounted this could still be running.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setSettled(true), DURATION.slow * 1000);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div className={cn("grid grid-cols-[minmax(0,1fr)]", className)}>
      <AnimatePresence initial={false}>
        {loading ? (
          <motion.div
            key="skeleton"
            className="pointer-events-none [grid-area:1/1]"
            exit={settled ? { opacity: 0, transition: EXIT } : undefined}
          >
            {skeleton}
          </motion.div>
        ) : (
          <motion.div
            key="content"
            className="[grid-area:1/1]"
            initial={settled ? { opacity: 0 } : false}
            animate={{ opacity: 1, transition: ENTER }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
