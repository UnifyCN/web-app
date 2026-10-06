import type { SyntheticEvent } from "react";

/**
 * Fade-in for images that had to be fetched, with no flicker for ones the
 * browser already has. Use `hideWhileLoading` as the `<img>` ref and
 * `revealOnLoad` as its `onLoad`, and add `IMAGE_FADE_CLASS`.
 *
 * An image the browser already holds is `complete` when React attaches the
 * ref, so it is never hidden and simply shows. Only an image that is still
 * loading is set to transparent. If it then arrives almost at once (a cache
 * hit that just wasn't synchronous, as with `loading="lazy"`), it is shown
 * without the fade, which would otherwise read as a blink on every revisit.
 * The style is set on the element directly because a state-driven version
 * misses `load` events that fire before hydration and would leave those
 * images hidden.
 */

/** Arrivals faster than this came from the cache, not the network. */
const CACHED_ARRIVAL_MS = 120;

export function hideWhileLoading(element: HTMLImageElement | null): void {
  if (!element || element.complete) return;
  element.style.opacity = "0";
  element.dataset.hiddenAt = String(performance.now());
}

export function revealOnLoad(event: SyntheticEvent<HTMLImageElement>): void {
  const element = event.currentTarget;
  const hiddenAt = Number(element.dataset.hiddenAt);
  delete element.dataset.hiddenAt;
  if (
    Number.isFinite(hiddenAt) &&
    performance.now() - hiddenAt < CACHED_ARRIVAL_MS
  ) {
    // Show it in this frame, then hand the transition back to the class.
    element.style.transition = "none";
    element.style.opacity = "";
    requestAnimationFrame(() => {
      element.style.transition = "";
    });
    return;
  }
  element.style.opacity = "";
}

/** Duration and curve come from the shared motion config (lib/motion.ts). */
export const IMAGE_FADE_CLASS =
  "transition-opacity duration-[var(--motion-base)] ease-out";
