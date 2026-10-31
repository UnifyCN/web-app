import { describe, expect, it } from "vitest";
import { arrivalMonthToDate, needsArrivalPrompt } from "./arrivalPrompt";

describe("needsArrivalPrompt", () => {
  it("asks dateless pre-arrival profiles for their arrival month", () => {
    expect(needsArrivalPrompt({ arrivalDate: null, stage: 0 })).toBe(true);
  });

  it("leaves everyone else alone", () => {
    expect(needsArrivalPrompt({ arrivalDate: "2026-12-01", stage: 0 })).toBe(false);
    expect(needsArrivalPrompt({ arrivalDate: null, stage: null })).toBe(false);
    expect(needsArrivalPrompt({ arrivalDate: "2024-01-01", stage: 3 })).toBe(false);
    expect(needsArrivalPrompt(null)).toBe(false);
  });

  it("stores the picked month as YYYY-MM-01", () => {
    expect(arrivalMonthToDate(2027, 3)).toBe("2027-03-01");
  });
});
