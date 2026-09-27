/**
 * One-time "What's new" card: which items it lists, where each "Show me" goes,
 * and the client-only state behind it.
 *
 * "Seen" is per user in localStorage (`unify.whatsNewSeen:<release>:<userId>`),
 * so every signed-in user gets the card once per browser. No DB write — the
 * shared DB is off-limits for this. Bump WHATS_NEW_RELEASE to show a future
 * card to everyone again.
 *
 * Two tiny in-memory stores (useSyncExternalStore-friendly) live here too:
 *  - the open request, so Settings can reopen the card from anywhere;
 *  - the pending highlight, set by "Show me" and read by WhatsNewHighlight
 *    after the client-side navigation lands. Both reset on a full reload.
 */

export const WHATS_NEW_RELEASE = "2026-09";

export type WhatsNewItemId = "job_tools" | "resources" | "language";

export interface WhatsNewItem {
  id: WhatsNewItemId;
  /** Where "Show me" navigates. */
  href: string;
  /** The highlight stays active only while the path starts with this. */
  pathPrefix: string;
  /** i18n key stem: `whatsNew.items.<key>.title|body`. */
  key: "jobTools" | "resources" | "language";
}

export const WHATS_NEW_ITEMS: readonly WhatsNewItem[] = [
  { id: "job_tools", href: "/resume", pathPrefix: "/resume", key: "jobTools" },
  { id: "resources", href: "/resources", pathPrefix: "/resources", key: "resources" },
  { id: "language", href: "/settings", pathPrefix: "/settings", key: "language" },
];

/**
 * `data-whats-new-target` values the highlight looks for, per item, in order of
 * preference. Job tools: "Target a job" inside a resume editor is the real job
 * import; on the /resume list the entry point is "New resume".
 */
export const HIGHLIGHT_TARGETS: Record<WhatsNewItemId, readonly string[]> = {
  job_tools: ["job-import", "job-import-start"],
  resources: ["resources-search"],
  language: ["language"],
};

/** i18n key for the tooltip shown on a given target. */
export const HIGHLIGHT_TIP_KEYS: Record<string, string> = {
  "job-import": "whatsNew.tips.jobImport",
  "job-import-start": "whatsNew.tips.jobImportStart",
  "resources-search": "whatsNew.tips.resources",
  language: "whatsNew.tips.language",
};

/* ------------------------------------------------------------------ *
 * Seen flag (per user).
 * ------------------------------------------------------------------ */

export function seenKey(userId: string): string {
  return `unify.whatsNewSeen:${WHATS_NEW_RELEASE}:${userId}`;
}

export function hasSeenWhatsNew(userId: string): boolean {
  try {
    return window.localStorage.getItem(seenKey(userId)) === "1";
  } catch {
    // Storage blocked: treat as seen so the card can't reappear on every page.
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
 * Minimal external stores.
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

/** Open request for the card; `trigger` is reported on `whats_new_shown`. */
export type WhatsNewTrigger = "auto" | "settings";
export const whatsNewOpenStore = createStore<WhatsNewTrigger | null>(null);

export function openWhatsNew(trigger: WhatsNewTrigger = "settings") {
  // A leftover highlight must never sit on top of the card.
  whatsNewHighlightStore.set(null);
  whatsNewOpenStore.set(trigger);
}

export function closeWhatsNew() {
  whatsNewOpenStore.set(null);
}

/** The item whose target should be highlighted after "Show me". */
export const whatsNewHighlightStore = createStore<WhatsNewItem | null>(null);

export function requestHighlight(item: WhatsNewItem) {
  whatsNewHighlightStore.set(item);
}

export function clearHighlight() {
  whatsNewHighlightStore.set(null);
}
