"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { errorVariants } from "@/components/auth/motion";
import { cn } from "@/lib/utils";

/**
 * Inline validation message that fades + slides in/out instead of popping. Renders
 * nothing when `children` is empty. Reduced-motion → opacity-only.
 */
export function FormError({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {children ? (
        <motion.p
          key="form-error"
          role="alert"
          initial={reduce ? { opacity: 0 } : "hidden"}
          animate={reduce ? { opacity: 1 } : "show"}
          exit={reduce ? { opacity: 0 } : "exit"}
          variants={reduce ? undefined : errorVariants}
          className={cn("text-sm text-destructive", className)}
        >
          {children}
        </motion.p>
      ) : null}
    </AnimatePresence>
  );
}
