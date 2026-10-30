import { describe, expect, it } from "vitest";
import {
  isVisibleForProvince,
  normalizeProvince,
  resolveUserProvince,
} from "./province";

describe("province rule (copied from mobile #347)", () => {
  it("shows national content (no province) to everyone", () => {
    for (const item of [null, undefined, "", []]) {
      expect(isVisibleForProvince(item, null)).toBe(true);
      expect(isVisibleForProvince(item, "Ontario")).toBe(true);
    }
  });

  it("shows province content only to users in that province", () => {
    expect(isVisibleForProvince("British Columbia", "British Columbia")).toBe(true);
    expect(isVisibleForProvince("British Columbia", "Alberta")).toBe(false);
    expect(isVisibleForProvince(["Ontario", "Quebec"], "Quebec")).toBe(true);
  });

  it("hides province content from users with no recognized province", () => {
    expect(isVisibleForProvince("Alberta", null)).toBe(false);
    expect(isVisibleForProvince("Alberta", "Somewhere")).toBe(false);
    // The user side must already be canonical: codes are resolved first.
    expect(isVisibleForProvince("British Columbia", "BC")).toBe(false);
    expect(
      isVisibleForProvince("British Columbia", resolveUserProvince("BC")),
    ).toBe(true);
  });

  it("maps stored codes and spellings to full names", () => {
    expect(normalizeProvince("ON")).toBe("Ontario");
    expect(normalizeProvince(" bc ")).toBe("British Columbia");
    expect(normalizeProvince("Québec")).toBe("Quebec");
    expect(normalizeProvince("PEI")).toBe("Prince Edward Island");
    expect(normalizeProvince("Alberta")).toBe("Alberta");
    expect(normalizeProvince("")).toBeNull();
    expect(normalizeProvince(null)).toBeNull();
    // Free text typed for "Other" is kept, but does not resolve.
    expect(normalizeProvince("Somewhere")).toBe("Somewhere");
    expect(resolveUserProvince("Somewhere")).toBeNull();
  });
});
