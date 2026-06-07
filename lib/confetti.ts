/**
 * Small, brand-coloured confetti burst for completion moments (e.g. ticking a
 * checklist task). canvas-confetti touches `document` at call time, so it is
 * lazy-imported here to keep it out of the SSR path and the initial bundle.
 *
 * Keep it subtle per the project's motion guidance (MOTION_INTENSITY≈3): a
 * short, low-particle pop, not a full cannon. Honours `prefers-reduced-motion`.
 */

/** Normalised viewport origin ([0,1] on each axis) for the burst. */
export interface ConfettiOrigin {
  x: number;
  y: number;
}

const BRAND_COLORS = ["#f68b26", "#ff9d40", "#ffdfc1", "#ff820b"];

export function fireTaskConfetti(origin?: ConfettiOrigin): void {
  void import("canvas-confetti").then(({ default: confetti }) => {
    confetti({
      particleCount: 45,
      spread: 60,
      startVelocity: 28,
      gravity: 0.9,
      decay: 0.9,
      ticks: 120,
      scalar: 0.85,
      colors: BRAND_COLORS,
      origin: origin ?? { x: 0.5, y: 0.5 },
      disableForReducedMotion: true,
    });
  });
}
