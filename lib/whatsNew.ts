/**
 * One-time "What's new" spotlight tour: its steps, what each one points at,
 * and the client-only state behind it.
 *
 * "Seen" is per user in localStorage (`unify.whatsNewTourSeen:<release>:<userId>`),
 * so every signed-in user gets the tour once per browser. No DB write — the
 * shared DB is off-limits for this. The key is new for the tour (the earlier
 * card used `unify.whatsNewSeen:…`), so people who dismissed the card still
 * see the tour once. Bump WHATS_NEW_RELEASE to show a future tour to everyone.
 *
 * The open request lives in a tiny in-memory store (useSyncExternalStore-
 * friendly) so the Settings row can replay the tour from anywhere.
 */

export const WHATS_NEW_RELEASE = "2026-09";

export type WhatsNewStepId = "job_tools" | "resources" | "language";

export interface WhatsNewStep {
  id: WhatsNewStepId;
  /** i18n key stem: `whatsNew.items.<key>.title|body`. */
  key: "jobTools" | "resources" | "language";
  /**
   * `data-tour` values to spotlight, in order of preference; the first one
   * that's on screen wins (the sidebar and bottom nav both carry the nav ones,
   * and only one of them is visible at a time).
   */
  targets: readonly string[];
}

export const WHATS_NEW_STEPS: readonly WhatsNewStep[] = [
  // Job tools is a desktop-only nav item, so phones skip this step (no
  // target on screen) rather than point at something unrelated.
  { id: "job_tools", key: "jobTools", targets: ["nav-job-tools"] },
  { id: "resources", key: "resources", targets: ["nav-resources"] },
  // The language picker itself when it's on the page (replaying from
  // Settings), otherwise the Settings nav item that leads to it.
  { id: "language", key: "language", targets: ["language", "nav-settings"] },
];

const NAV_TOUR_TARGETS: Record<string, string> = {
  "/resume": "nav-job-tools",
  "/resources": "nav-resources",
  "/settings": "nav-settings",
};

/** `data-tour` value for a nav item's href, or undefined if it isn't a stop. */
export function navTourTarget(href: string): string | undefined {
  return NAV_TOUR_TARGETS[href];
}

/** The first on-screen element for a step, or null when none is visible. */
export function findStepTarget(step: WhatsNewStep): HTMLElement | null {
  for (const target of step.targets) {
    for (const el of document.querySelectorAll<HTMLElement>(
      `[data-tour="${target}"]`,
    )) {
      // Skip hidden copies (the sidebar below md, the bottom nav above it).
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return el;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Seen flag (per user).
 * ------------------------------------------------------------------ */

export function seenKey(userId: string): string {
  return `unify.whatsNewTourSeen:${WHATS_NEW_RELEASE}:${userId}`;
}

export function hasSeenWhatsNew(userId: string): boolean {
  try {
    return window.localStorage.getItem(seenKey(userId)) === "1";
  } catch {
    // Storage blocked: treat as seen so the tour can't reappear on every page.
    return true;
  }
}

export function markWhatsNewSeen(userId: string) {
  try {
    window.localStorage.setItem(seenKey(userId), "1");
  } catch {
    // ignore
  }
}

/* ------------------------------------------------------------------ *
 * Minimal external store.
 * ------------------------------------------------------------------ */

function createStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next: T) {
      value = next;
      listeners.forEach((l) => l());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** Open request for the tour; `trigger` is reported on `whats_new_shown`. */
export type WhatsNewTrigger = "auto" | "settings";
export const whatsNewOpenStore = createStore<WhatsNewTrigger | null>(null);

export function openWhatsNew(trigger: WhatsNewTrigger = "settings") {
  whatsNewOpenStore.set(trigger);
}

export function closeWhatsNew() {
  whatsNewOpenStore.set(null);
}

/* ------------------------------------------------------------------ *
 * Tooltip placement (pure, unit-tested).
 * ------------------------------------------------------------------ */

/** Physical side of the target the tooltip sits on. */
export type Side = "left" | "right" | "top" | "bottom";

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Placement {
  side: Side;
  /** Top-left of the tooltip, in viewport px. */
  left: number;
  top: number;
}

/**
 * Where the tooltip goes relative to the spotlight: beside it on the reading
 * "end" side first (right in LTR, left in RTL: away from the sidebar), then
 * the other side, then below, then above. It flips to the first side that
 * fits in the viewport, then slides along that side to stay `edge` px from
 * the viewport edges.
 */
export function placeTooltip(
  target: Box,
  tip: { width: number; height: number },
  viewport: { width: number; height: number },
  rtl: boolean,
  gap: number,
  edge: number,
): Placement {
  const clamp = (v: number, min: number, max: number) =>
    Math.min(Math.max(v, min), Math.max(min, max));
  const y = clamp(
    target.top + target.height / 2 - tip.height / 2,
    edge,
    viewport.height - edge - tip.height,
  );
  const x = clamp(
    target.left + target.width / 2 - tip.width / 2,
    edge,
    viewport.width - edge - tip.width,
  );

  const candidates: Record<Side, { fits: boolean; left: number; top: number }> = {
    right: {
      fits: target.left + target.width + gap + tip.width <= viewport.width - edge,
      left: target.left + target.width + gap,
      top: y,
    },
    left: {
      fits: target.left - gap - tip.width >= edge,
      left: target.left - gap - tip.width,
      top: y,
    },
    bottom: {
      fits: target.top + target.height + gap + tip.height <= viewport.height - edge,
      left: x,
      top: target.top + target.height + gap,
    },
    top: {
      fits: target.top - gap - tip.height >= edge,
      left: x,
      top: target.top - gap - tip.height,
    },
  };
  const order: Side[] = rtl
    ? ["left", "right", "bottom", "top"]
    : ["right", "left", "bottom", "top"];
  const side = order.find((s) => candidates[s].fits) ?? "top";
  return { side, left: candidates[side].left, top: candidates[side].top };
}
