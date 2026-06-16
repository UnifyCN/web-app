"use client";

import { useReducedMotion, type Variants } from "framer-motion";

/**
 * Shared auth-screen motion presets. One source of truth so the carousel, form
 * fields, OTP boxes, errors, and page transitions all animate identically and
 * stay within the project's subtle, ≤300ms motion budget. Every consumer goes
 * through `useReducedMotion()` so motion collapses to opacity-only / instant.
 */

const STAGGER = 0.05;

export const staggerContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: STAGGER, delayChildren: 0.04 } },
};

/** Fade + slide up — the base entrance for cards, fields, and OTP boxes. */
export const fadeUpItem: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.2, ease: "easeOut" } },
};

/** Validation errors: fade + slide down into place (and back out on clear). */
export const errorVariants: Variants = {
  hidden: { opacity: 0, y: -6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.15, ease: "easeOut" } },
  exit: { opacity: 0, y: -6, transition: { duration: 0.12, ease: "easeIn" } },
};

/** Per-route entrance for the (auth) template. */
export const pageVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: "easeOut" } },
};

/**
 * Stagger props for a container + its items, collapsed to static under reduced
 * motion. Spread `container` on the wrapper and `item` on each child.
 */
export function useStagger() {
  const reduce = useReducedMotion();
  if (reduce) return { container: {}, item: {} } as const;
  return {
    container: {
      initial: "hidden",
      animate: "show",
      variants: staggerContainer,
    },
    item: { variants: fadeUpItem },
  } as const;
}
