"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * A template re-mounts on every navigation within the (auth) group, so this is
 * where the per-screen entrance lives: a subtle fade + slide-up as the user moves
 * between /welcome, /signup, /login, /verify-email, /forgot-password,
 * /reset-password, and /before-you-continue. Reduced-motion → quick fade only.
 */
export default function AuthTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0.15 : 0.22, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
