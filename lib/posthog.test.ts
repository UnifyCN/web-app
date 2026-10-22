import { describe, expect, it } from "vitest";
import { shouldResetPostHog } from "./posthog";

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
