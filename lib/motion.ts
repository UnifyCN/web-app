import type { CSSProperties } from "react";
import type { Transition } from "framer-motion";

/**
 * The one motion config for the app. Framer Motion reads these values
 * directly; CSS reads the same values through the `--motion-*` variables the
 * root layout sets from `motionCssVars`, so a change here reaches both.
 *
 * Two speeds on one curve: taps are acknowledged in `press`, anything that
 * arrives settles in `base`. Timings follow the native app (fades 200ms in,
 * 150ms out, ease-out cubic) so web and mobile feel like one product.
 * Movement is transform/opacity only, nothing loops, and exits are plain fades.
 */

/** Seconds, as Framer Motion expects. */
export const DURATION = {
  /** Touch feedback: press scale / dim, hover colour. */
  press: 0.12,
  /** Small reveals and every exit. */
  fast: 0.15,
  /** Anything that arrives: page, dialog, menu, loaded content. */
  base: 0.2,
  /** Larger travel: progress fills. */
  slow: 0.25,
} as const;

type Bezier = [number, number, number, number];

export const EASE = {
  /** Ease-out cubic: everything that arrives. */
  out: [0.33, 1, 0.68, 1] as Bezier,
  /** Ease-in cubic: everything that leaves. */
  in: [0.32, 0, 0.67, 0] as Bezier,
} as const;

/** No-bounce spring for elements that slide between positions (tab underline). */
export const SPRING: Transition = {
  type: "spring",
  visualDuration: DURATION.base,
  bounce: 0,
};

/** Buttons and cards shrink to this while pressed. */
export const PRESS_SCALE = 0.97;
/** Rows and nav tiles dim to this while pressed, as the native app does. */
export const PRESS_DIM = 0.7;

export const ENTER: Transition = { duration: DURATION.base, ease: EASE.out };
export const ENTER_FAST: Transition = {
  duration: DURATION.fast,
  ease: EASE.out,
};
export const EXIT: Transition = { duration: DURATION.fast, ease: EASE.in };

/** Plain fade, in and out. */
export const fade = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: ENTER },
  exit: { opacity: 0, transition: EXIT },
} as const;

/** Dialog backdrop. Stops taking clicks the moment it starts leaving. */
export const overlayMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: ENTER_FAST },
  exit: { opacity: 0, pointerEvents: "none", transition: EXIT },
} as const;

/** Dialog panel: settles in, leaves as a plain fade. */
export const panelMotion = {
  initial: { opacity: 0, y: 8, scale: PRESS_SCALE },
  animate: { opacity: 1, y: 0, scale: 1, transition: ENTER },
  exit: { opacity: 0, transition: EXIT },
} as const;

/** Menus and popovers: grow slightly from their trigger corner. */
export const menuMotion = {
  initial: { opacity: 0, scale: PRESS_SCALE },
  animate: {
    opacity: 1,
    scale: 1,
    transition: { duration: DURATION.press, ease: EASE.out },
  },
  exit: { opacity: 0, transition: { duration: 0.1, ease: EASE.in } },
} as const;

/** Content revealed in place (an opened section, a thread of replies). */
export const revealMotion = {
  initial: { opacity: 0, y: -4 },
  animate: { opacity: 1, y: 0, transition: ENTER_FAST },
} as const;

const ms = (seconds: number) => `${Math.round(seconds * 1000)}ms`;
const bezier = (points: Bezier) => `cubic-bezier(${points.join(", ")})`;

/** The same values as CSS custom properties; set on `<html>` by the root layout. */
export const motionCssVars = {
  "--motion-press": ms(DURATION.press),
  "--motion-fast": ms(DURATION.fast),
  "--motion-base": ms(DURATION.base),
  "--motion-slow": ms(DURATION.slow),
  "--motion-ease-out": bezier(EASE.out),
  "--motion-ease-in": bezier(EASE.in),
  "--motion-press-scale": String(PRESS_SCALE),
  "--motion-press-dim": String(PRESS_DIM),
} as CSSProperties;
