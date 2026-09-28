import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const captureMock = vi.fn();
vi.mock("@/lib/posthog", () => ({
  isPostHogConfigured: () => true,
  posthog: { capture: (...args: unknown[]) => captureMock(...args) },
}));

import {
  HIGHLIGHT_TARGETS,
  HIGHLIGHT_TIP_KEYS,
  WHATS_NEW_ITEMS,
  clearHighlight,
  closeWhatsNew,
  hasSeenWhatsNew,
  markWhatsNewSeen,
  openWhatsNew,
  requestHighlight,
  seenKey,
  whatsNewHighlightStore,
  whatsNewOpenStore,
} from "./whatsNew";
import {
  trackWhatsNewDismissed,
  trackWhatsNewShowMe,
  trackWhatsNewShown,
} from "./analytics";
import en from "./i18n/locales/en/translation.json";

function stubStorage(store = new Map<string, string>()) {
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    },
  });
  return store;
}

afterEach(() => vi.unstubAllGlobals());

describe("seen flag", () => {
  it("is per user", () => {
    stubStorage();
    expect(hasSeenWhatsNew("a")).toBe(false);
    markWhatsNewSeen("a");
    expect(hasSeenWhatsNew("a")).toBe(true);
    expect(hasSeenWhatsNew("b")).toBe(false);
    expect(seenKey("a")).toContain(":a");
  });

  it("treats blocked storage as seen (never nags on every page)", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
      },
    });
    expect(hasSeenWhatsNew("a")).toBe(true);
  });
});

describe("items", () => {
  it("lists job tools, resources, language — in that order, with their routes", () => {
    expect(WHATS_NEW_ITEMS.map((i) => [i.id, i.href])).toEqual([
      ["job_tools", "/resume"],
      ["resources", "/resources"],
      ["language", "/settings"],
    ]);
  });

  it("every item and highlight tip has English copy", () => {
    type Tree = { [k: string]: Tree | string | undefined };
    const whatsNew = (en as unknown as Tree).whatsNew as Tree;
    const items = whatsNew.items as Record<string, Record<string, string>>;
    for (const item of WHATS_NEW_ITEMS) {
      expect(items[item.key].title).toBeTruthy();
      expect(items[item.key].body).toBeTruthy();
      if (item.id === "job_tools") {
        // Phone copy that doesn't point at the desktop-only Job tools nav.
        const mobile = (items[item.key] as unknown as Record<string, Record<string, string>>).mobile;
        expect(mobile.title).toBeTruthy();
        expect(mobile.body).not.toMatch(/Job tools/);
      }
      for (const target of HIGHLIGHT_TARGETS[item.id]) {
        const key = HIGHLIGHT_TIP_KEYS[target].split(".").slice(1);
        const copy = key.reduce<Tree | string | undefined>(
          (o, k) => (typeof o === "object" ? o[k] : undefined),
          whatsNew,
        );
        expect(copy, target).toBeTruthy();
      }
    }
  });
});

describe("stores", () => {
  it("open / close and highlight request / clear notify subscribers", () => {
    const onOpen = vi.fn();
    const unsub = whatsNewOpenStore.subscribe(onOpen);
    openWhatsNew("settings");
    expect(whatsNewOpenStore.get()).toBe("settings");
    closeWhatsNew();
    expect(whatsNewOpenStore.get()).toBeNull();
    expect(onOpen).toHaveBeenCalledTimes(2);
    unsub();

    requestHighlight(WHATS_NEW_ITEMS[0]);
    expect(whatsNewHighlightStore.get()?.id).toBe("job_tools");
    clearHighlight();
    expect(whatsNewHighlightStore.get()).toBeNull();

    // Reopening the card drops any leftover highlight.
    requestHighlight(WHATS_NEW_ITEMS[2]);
    openWhatsNew("settings");
    expect(whatsNewHighlightStore.get()).toBeNull();
    closeWhatsNew();
  });
});

describe("analytics", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {});
    captureMock.mockReset();
  });

  it("sends exactly the three events with their properties", () => {
    trackWhatsNewShown({ trigger: "auto" });
    trackWhatsNewDismissed();
    trackWhatsNewShowMe({ item: "resources" });
    expect(captureMock.mock.calls).toEqual([
      ["whats_new_shown", { trigger: "auto" }],
      ["whats_new_dismissed", undefined],
      ["whats_new_show_me", { item: "resources" }],
    ]);
  });
});
