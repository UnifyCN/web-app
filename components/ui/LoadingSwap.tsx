"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ENTER, EXIT, LOADING_DELAY } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Skeleton → content, in place over the same grid cell, so nothing jumps.
 *
 * The skeleton stays invisible for `LOADING_DELAY` (it still holds its space),
 * so a fast load never flashes one: content that arrives inside that window, or
 * is already cached, simply appears. Only when the skeleton has actually been
 * on screen does the swap crossfade (opacity only), skeleton out as content in.
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
  // True once this load has lasted long enough for the skeleton to be visible.
  const [skeletonShown, setSkeletonShown] = useState(false);
  useEffect(() => {
    if (!loading) return;
    const id = window.setTimeout(
      () => setSkeletonShown(true),
      LOADING_DELAY * 1000,
    );
    return () => {
      window.clearTimeout(id);
      // Runs after the content has mounted with its entrance already chosen,
      // so the next load starts from "not shown" again.
      setSkeletonShown(false);
    };
  }, [loading]);

  return (
    <div className={cn("grid grid-cols-[minmax(0,1fr)]", className)}>
      <AnimatePresence initial={false}>
        {loading ? (
          <motion.div
            key="skeleton"
            className="loading-delayed pointer-events-none [grid-area:1/1]"
            exit={skeletonShown ? { opacity: 0, transition: EXIT } : undefined}
          >
            {skeleton}
          </motion.div>
        ) : (
          <motion.div
            key="content"
            className="[grid-area:1/1]"
            initial={skeletonShown ? { opacity: 0 } : false}
            animate={{ opacity: 1, transition: ENTER }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
