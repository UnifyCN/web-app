import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_EMAIL_TTL_MS,
  clearAllAuthEmails,
  clearAuthEmail,
  readAuthEmail,
  storeAuthEmail,
  takeAuthEmail,
} from "./authEmailHandoff";

/** Minimal browser stand-in: sessionStorage + location + history.replaceState. */
function fakeWindow(url: string, { storageThrows = false } = {}) {
  const store = new Map<string, string>();
  const sessionStorage = {
    getItem: (k: string) => {
      if (storageThrows) throw new Error("SecurityError");
      return store.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      if (storageThrows) throw new Error("QuotaExceededError");
      store.set(k, v);
    },
    removeItem: (k: string) => {
      if (storageThrows) throw new Error("SecurityError");
      store.delete(k);
    },
  };
  const parsed = new globalThis.URL(url);
  const location = {
    pathname: parsed.pathname,
    search: parsed.search,
    hash: parsed.hash,
  };
  const history = {
    state: { __NA: true },
    replaceState: vi.fn((_state: unknown, _unused: string, next: string) => {
      const u = new globalThis.URL(next, parsed.origin);
      location.pathname = u.pathname;
      location.search = u.search;
      location.hash = u.hash;
    }),
  };
  return { sessionStorage, location, history, store };
}

let win: ReturnType<typeof fakeWindow>;

function useWindow(url: string, opts?: { storageThrows?: boolean }) {
  win = fakeWindow(url, opts);
  vi.stubGlobal("window", win);
}

beforeEach(() => useWindow("https://app.unifysocial.ca/verify-email"));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("auth email hand-off", () => {
  it("stores, reads and clears the email per flow", () => {
    storeAuthEmail("verify", "a+test@b.co");
    storeAuthEmail("reset", "c@d.co");
    expect(readAuthEmail("verify")).toBe("a+test@b.co");
    expect(readAuthEmail("reset")).toBe("c@d.co");
    clearAuthEmail("verify");
    expect(readAuthEmail("verify")).toBe("");
    expect(readAuthEmail("reset")).toBe("c@d.co");
  });

  it("takes the stored email and leaves a clean URL untouched", () => {
    storeAuthEmail("verify", "a@b.co");
    expect(takeAuthEmail("verify")).toBe("a@b.co");
    expect(win.history.replaceState).not.toHaveBeenCalled();
  });

  it("a new tab starts with no email (its own empty sessionStorage)", () => {
    storeAuthEmail("verify", "a@b.co");
    // A separately opened tab gets a fresh window + sessionStorage.
    useWindow("https://app.unifysocial.ca/verify-email");
    expect(takeAuthEmail("verify")).toBe("");
    expect(takeAuthEmail("reset")).toBe("");
  });

  it("clears every flow at once (sign-out)", () => {
    storeAuthEmail("verify", "a@b.co");
    storeAuthEmail("reset", "c@d.co");
    clearAllAuthEmails();
    expect(readAuthEmail("verify")).toBe("");
    expect(readAuthEmail("reset")).toBe("");
    expect(win.store.size).toBe(0);
  });

  it("expires a hand-off after an hour and removes it", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-26T10:00:00Z"));
    storeAuthEmail("verify", "a@b.co");
    vi.setSystemTime(Date.now() + AUTH_EMAIL_TTL_MS - 1000);
    expect(readAuthEmail("verify")).toBe("a@b.co");
    vi.setSystemTime(Date.now() + 2000);
    expect(readAuthEmail("verify")).toBe("");
    expect(win.store.size).toBe(0);
  });

  it("treats a malformed stored value as absent", () => {
    win.store.set("unify_auth_email:verify", "not-json@b.co");
    expect(readAuthEmail("verify")).toBe("");
    expect(win.store.size).toBe(0);
  });

  it("adopts a legacy ?email= link: stores it and strips it from the URL", () => {
    useWindow(
      "https://app.unifysocial.ca/reset-password?lang=fr&email=a%2Btest%40b.co#top",
    );
    expect(takeAuthEmail("reset")).toBe("a+test@b.co");
    expect(readAuthEmail("reset")).toBe("a+test@b.co");
    expect(win.history.replaceState).toHaveBeenCalledWith(
      null,
      "",
      "/reset-password?lang=fr#top",
    );
    // A refresh after the strip still finds it, now from storage.
    expect(takeAuthEmail("reset")).toBe("a+test@b.co");
    expect(win.history.replaceState).toHaveBeenCalledTimes(1);
  });

  it("strips a lone ?email= without leaving a dangling '?'", () => {
    useWindow("https://app.unifysocial.ca/verify-email?email=a%40b.co");
    takeAuthEmail("verify");
    expect(win.location.search).toBe("");
    expect(win.history.replaceState).toHaveBeenCalledWith(
      null,
      "",
      "/verify-email",
    );
  });

  it("survives blocked storage: still strips the URL, falls back to ''", () => {
    useWindow("https://app.unifysocial.ca/verify-email?email=a%40b.co", {
      storageThrows: true,
    });
    expect(() => storeAuthEmail("verify", "x@y.co")).not.toThrow();
    expect(() => clearAuthEmail("verify")).not.toThrow();
    expect(readAuthEmail("verify")).toBe("");
    // The legacy link still works for this page view and the URL is cleaned.
    expect(takeAuthEmail("verify")).toBe("a@b.co");
    expect(win.location.search).toBe("");
  });

  it("is a no-op during SSR (no window)", () => {
    vi.unstubAllGlobals();
    vi.stubGlobal("window", undefined);
    expect(takeAuthEmail("verify")).toBe("");
    expect(readAuthEmail("verify")).toBe("");
    expect(() => storeAuthEmail("verify", "a@b.co")).not.toThrow();
  });
});
