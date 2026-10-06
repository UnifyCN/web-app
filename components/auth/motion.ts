"use client";

import { useReducedMotion, type Variants } from "framer-motion";
import { useIsFirstLoad } from "@/hooks/useIsFirstLoad";
import { DURATION, EASE } from "@/lib/motion";

/**
 * Shared auth-screen motion presets, built on the app-wide timings and curves
 * in lib/motion.ts, so the carousel, form fields, OTP boxes, errors, and page
 * transitions all animate identically and stay within the ≤300ms budget. Every
 * consumer goes through `useReducedMotion()` so motion collapses to
 * opacity-only / instant.
 */

const STAGGER = 0.05;

export const staggerContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: STAGGER, delayChildren: 0.04 } },
};

/** Fade + slide up — the base entrance for cards, fields, and OTP boxes. */
export const fadeUpItem: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.base, ease: EASE.out },
  },
};

/** Validation errors: fade + slide down into place (and back out on clear). */
export const errorVariants: Variants = {
  hidden: { opacity: 0, y: -6 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.fast, ease: EASE.out },
  },
  exit: {
    opacity: 0,
    y: -6,
    transition: { duration: DURATION.press, ease: EASE.in },
  },
};

/** Per-route entrance for the (auth) template. */
export const pageVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.base, ease: EASE.out },
  },
};

/**
 * Stagger props for a container + its items, collapsed to static under reduced
 * motion and on the first page load (the screen someone lands on should be
 * visible as soon as the server HTML arrives, not after hydration). Spread
 * `container` on the wrapper and `item` on each child.
 */
export function useStagger() {
  const reduce = useReducedMotion();
  const isFirstLoad = useIsFirstLoad();
  if (reduce || isFirstLoad) return { container: {}, item: {} } as const;
  return {
    container: {
      initial: "hidden",
      animate: "show",
      variants: staggerContainer,
    },
    item: { variants: fadeUpItem },
  } as const;
}
