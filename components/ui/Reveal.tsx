"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { revealMotion } from "@/lib/motion";

/**
 * Content the user opens in place: a checklist section, a thread of replies.
 * The container takes its new size at once (height is not animated) and the
 * content fades in with a short drop; closing removes it immediately. Content
 * that is already open when the parent first renders does not animate.
 */
export function Reveal({
  open,
  className,
  children,
}: {
  open: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div key="reveal" className={className} {...revealMotion}>
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
