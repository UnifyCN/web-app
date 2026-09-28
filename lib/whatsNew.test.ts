import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const captureMock = vi.fn();
vi.mock("@/lib/posthog", () => ({
  isPostHogConfigured: () => true,
  posthog: { capture: (...args: unknown[]) => captureMock(...args) },
}));

import {
  WHATS_NEW_STEPS,
  closeWhatsNew,
  hasSeenWhatsNew,
  markWhatsNewSeen,
  navTourTarget,
  openWhatsNew,
  placeTooltip,
  seenKey,
  whatsNewOpenStore,
} from "./whatsNew";
import {
  trackWhatsNewCompleted,
  trackWhatsNewDismissed,
  trackWhatsNewShown,
  trackWhatsNewStep,
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

describe("seen key", () => {
  it("is new for the tour, so people who saw the old card still get it", () => {
    expect(seenKey("a")).toMatch(/^unify\.whatsNewTourSeen:/);
    expect(seenKey("a")).not.toMatch(/^unify\.whatsNewSeen:/);
  });
});

describe("steps", () => {
  it("are job tools, resources, language, in that order", () => {
    expect(WHATS_NEW_STEPS.map((s) => s.id)).toEqual([
      "job_tools",
      "resources",
      "language",
    ]);
  });

  it("point at the nav items the sidebar / bottom nav tag", () => {
    expect(navTourTarget("/resume")).toBe("nav-job-tools");
    expect(navTourTarget("/resources")).toBe("nav-resources");
    expect(navTourTarget("/settings")).toBe("nav-settings");
    expect(navTourTarget("/home")).toBeUndefined();
    const navTargets = new Set(["nav-job-tools", "nav-resources", "nav-settings"]);
    for (const step of WHATS_NEW_STEPS) {
      expect(step.targets.some((t) => navTargets.has(t)), step.id).toBe(true);
    }
  });

  it("every step has English copy", () => {
    const items = (en as unknown as {
      whatsNew: { items: Record<string, { title: string; body: string }> };
    }).whatsNew.items;
    for (const step of WHATS_NEW_STEPS) {
      expect(items[step.key].title).toBeTruthy();
      expect(items[step.key].body).toBeTruthy();
    }
  });
});

describe("placeTooltip", () => {
  const tip = { width: 300, height: 180 };
  const vp = { width: 1440, height: 900 };
  const sidebarItem = { left: 6, top: 300, width: 88, height: 56 };

  it("goes beside a desktop sidebar item, vertically centred", () => {
    const p = placeTooltip(sidebarItem, tip, vp, false, 44, 12);
    expect(p.side).toBe("right");
    expect(p.left).toBe(6 + 88 + 44);
    expect(p.top).toBe(300 + 28 - 90);
  });

  it("mirrors in RTL (sidebar on the right)", () => {
    const rtlItem = { left: 1440 - 94, top: 300, width: 88, height: 56 };
    const p = placeTooltip(rtlItem, tip, vp, true, 44, 12);
    expect(p.side).toBe("left");
    expect(p.left).toBe(1440 - 94 - 44 - 300);
  });

  it("flips to the other side when the preferred one doesn't fit", () => {
    const nearRight = { left: 1300, top: 300, width: 88, height: 56 };
    expect(placeTooltip(nearRight, tip, vp, false, 44, 12).side).toBe("left");
  });

  it("sits above a phone bottom-nav item and stays on screen", () => {
    const phone = { width: 375, height: 812 };
    const navItem = { left: 300, top: 752, width: 70, height: 60 };
    const p = placeTooltip(navItem, { width: 351, height: 180 }, phone, false, 44, 12);
    expect(p.side).toBe("top");
    expect(p.top).toBe(752 - 44 - 180);
    expect(p.left).toBe(12);
    expect(p.left + 351).toBeLessThanOrEqual(375 - 12);
  });

  it("clamps the cross axis inside the viewport", () => {
    const low = { left: 6, top: 850, width: 88, height: 40 };
    const p = placeTooltip(low, tip, vp, false, 44, 12);
    expect(p.side).toBe("right");
    expect(p.top).toBe(900 - 12 - 180);
  });
});

describe("store", () => {
  it("open / close notify subscribers", () => {
    const onOpen = vi.fn();
    const unsub = whatsNewOpenStore.subscribe(onOpen);
    openWhatsNew("settings");
    expect(whatsNewOpenStore.get()).toBe("settings");
    closeWhatsNew();
    expect(whatsNewOpenStore.get()).toBeNull();
    expect(onOpen).toHaveBeenCalledTimes(2);
    unsub();
  });
});

describe("analytics", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {});
    captureMock.mockReset();
  });

  it("sends the four tour events with their properties", () => {
    trackWhatsNewShown({ trigger: "auto" });
    trackWhatsNewStep({ step: 2 });
    trackWhatsNewDismissed({ atStep: 2 });
    trackWhatsNewCompleted();
    expect(captureMock.mock.calls).toEqual([
      ["whats_new_shown", { trigger: "auto" }],
      ["whats_new_step", { step: 2 }],
      ["whats_new_dismissed", { at_step: 2 }],
      ["whats_new_completed", undefined],
    ]);
  });
});
