import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RECOVERY_COOKIE,
  clearRecoveryPending,
  markRecoveryPending,
  readRecoveryPending,
  recoveryGate,
} from "./recoveryPending";

describe("recoveryGate (proxy)", () => {
  const USER = "11111111-1111-1111-1111-111111111111";

  it("has no opinion without a marker, or for another user's marker", () => {
    expect(recoveryGate("/home", undefined, USER)).toBeNull();
    expect(recoveryGate("/home", "someone-else", USER)).toBeNull();
    expect(recoveryGate("/reset-password", undefined, USER)).toBeNull();
  });

  it("keeps a recovering user on /reset-password", () => {
    expect(recoveryGate("/reset-password", USER, USER)).toBe("allow");
    for (const path of ["/home", "/login", "/onboarding", "/settings"]) {
      expect(recoveryGate(path, USER, USER)).toBe("redirect");
    }
  });

  it("leaves API and /auth routes alone", () => {
    expect(recoveryGate("/api/translate", USER, USER)).toBeNull();
    expect(recoveryGate("/auth/callback", USER, USER)).toBeNull();
  });
});

describe("recovery marker cookie (client)", () => {
  afterEach(() => vi.unstubAllGlobals());

  /** document.cookie stand-in that honours Max-Age=0 deletes. */
  function fakeDocument() {
    const jar = new Map<string, string>();
    const doc = {
      get cookie() {
        return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
      },
      set cookie(raw: string) {
        const [pair, ...attrs] = raw.split("; ");
        const [k, v] = [
          pair.slice(0, pair.indexOf("=")),
          pair.slice(pair.indexOf("=") + 1),
        ];
        if (attrs.includes("Max-Age=0")) jar.delete(k);
        else jar.set(k, v);
      },
    };
    vi.stubGlobal("document", doc);
    vi.stubGlobal("window", { location: { protocol: "http:" } });
    return jar;
  }

  it("marks, reads and clears the pending user id", () => {
    const jar = fakeDocument();
    expect(readRecoveryPending()).toBe("");
    markRecoveryPending("user-1");
    expect(jar.has(RECOVERY_COOKIE)).toBe(true);
    expect(readRecoveryPending()).toBe("user-1");
    clearRecoveryPending();
    expect(readRecoveryPending()).toBe("");
  });

  it("is a no-op without a document (SSR)", () => {
    expect(() => markRecoveryPending("user-1")).not.toThrow();
    expect(readRecoveryPending()).toBe("");
    expect(() => clearRecoveryPending()).not.toThrow();
  });
});
