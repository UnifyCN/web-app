"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useIsFirstLoad } from "@/hooks/useIsFirstLoad";
import { DURATION, EASE } from "@/lib/motion";

/**
 * A template re-mounts on every navigation within the (auth) group, so this is
 * where the per-screen entrance lives: a subtle fade + slide-up as the user moves
 * between /welcome, /signup, /login, /verify-email, /forgot-password,
 * /reset-password, and /before-you-continue. Reduced-motion → quick fade only.
 * The screen someone lands on is not animated: it should be visible as soon as
 * the server HTML arrives, not after hydration.
 */
export default function AuthTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  const isFirstLoad = useIsFirstLoad();
  return (
    <motion.div
      initial={
        isFirstLoad ? false : reduce ? { opacity: 0 } : { opacity: 0, y: 8 }
      }
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: reduce ? DURATION.fast : DURATION.base,
        ease: EASE.out,
      }}
    >
      {children}
    </motion.div>
  );
}
