import { afterEach, describe, expect, it, vi } from "vitest";

const init = vi.fn();
vi.mock("posthog-js", () => ({
  default: { init: (...args: unknown[]) => init(...args), register: vi.fn() },
}));

import { initPostHog, shouldResetPostHog } from "./posthog";

describe("shouldResetPostHog", () => {
  it("resets on an explicit sign-out", () => {
    expect(shouldResetPostHog("SIGNED_OUT", "identified")).toBe(true);
    expect(shouldResetPostHog("SIGNED_OUT", "anonymous")).toBe(true);
  });

  it("resets a still-identified user whose session is gone", () => {
    expect(shouldResetPostHog("INITIAL_SESSION", "identified")).toBe(true);
  });

  it("keeps an anonymous visitor's id so landing history merges at sign-up", () => {
    expect(shouldResetPostHog("INITIAL_SESSION", "anonymous")).toBe(false);
    expect(shouldResetPostHog("INITIAL_SESSION", undefined)).toBe(false);
    expect(shouldResetPostHog("TOKEN_REFRESHED", "anonymous")).toBe(false);
  });
});

describe("initPostHog", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("shares the landing page's identity cookie and prefers it on conflict", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://us.i.posthog.com");
    vi.stubGlobal("window", {});
    initPostHog();
    expect(init).toHaveBeenCalledWith(
      "phc_test",
      expect.objectContaining({
        persistence: "localStorage+cookie",
        cross_subdomain_cookie: true,
        __preview_cookie_wins_on_conflict: true,
      }),
    );
  });
});
