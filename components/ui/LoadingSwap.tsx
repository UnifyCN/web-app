"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ENTER, EXIT } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Skeleton → content, as a crossfade in place: the skeleton fades out while
 * the content fades in over the same grid cell, so nothing jumps. Opacity
 * only. When the data is already there on first render (a cached revisit),
 * the content is simply shown, with no fade.
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
  return (
    <div className={cn("grid grid-cols-[minmax(0,1fr)]", className)}>
      <AnimatePresence initial={false}>
        {loading ? (
          <motion.div
            key="skeleton"
            className="pointer-events-none [grid-area:1/1]"
            exit={{ opacity: 0, transition: EXIT }}
          >
            {skeleton}
          </motion.div>
        ) : (
          <motion.div
            key="content"
            className="[grid-area:1/1]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: ENTER }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
