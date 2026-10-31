import { describe, expect, it } from "vitest";
import {
  calculateUserStage,
  checklistStage,
  isAwaitingArrivalDate,
  resolveProfileStage,
  stageCacheIsCurrent,
} from "./calculateUserStage";

// Local noon, so the device day is unambiguous in any test time zone.
const today = new Date(2026, 9, 30, 12); // 2026-10-30

describe("calculateUserStage (mobile's arrivalStage rule)", () => {
  it("is unknown (null) with no usable date, not 'not arrived'", () => {
    expect(calculateUserStage(null, today)).toBeNull();
    expect(calculateUserStage(undefined, today)).toBeNull();
    expect(calculateUserStage("", today)).toBeNull();
    expect(calculateUserStage("not a date", today)).toBeNull();
    expect(calculateUserStage("2026-02-30", today)).toBeNull();
  });

  it("is 0 (pre-arrival) for a future date", () => {
    expect(calculateUserStage("2026-12-01", today)).toBe(0);
    expect(calculateUserStage("2030-01-01", today)).toBe(0);
  });

  it("counts whole calendar months since arrival", () => {
    expect(calculateUserStage("2026-10-30", today)).toBe(1); // arrived today
    expect(calculateUserStage("2026-08-01", today)).toBe(1); // 2 months
    expect(calculateUserStage("2026-07-30", today)).toBe(2); // exactly 3 months
    expect(calculateUserStage("2026-07-31", today)).toBe(1); // 3 months tomorrow
    expect(calculateUserStage("2025-10-31", today)).toBe(2); // 11 months
    expect(calculateUserStage("2025-10-30", today)).toBe(3); // 12 months
    expect(calculateUserStage("2023-10-31", today)).toBe(3); // 35 months
    expect(calculateUserStage("2023-10-30", today)).toBe(4); // 36 months
  });

  it("reads the timestamptz the database returns as its UTC date", () => {
    expect(calculateUserStage("2026-12-01T00:00:00+00:00", today)).toBe(0);
    expect(calculateUserStage("2026-08-01T00:00:00+00:00", today)).toBe(1);
    expect(calculateUserStage("2026-08-01 00:00:00+00", today)).toBe(1);
    // No offset is not an instant: unknown.
    expect(calculateUserStage("2026-08-01T00:00:00", today)).toBeNull();
  });
});

describe("checklistStage", () => {
  it("gives an unknown stage the first-3-months checklist, as on mobile", () => {
    expect(checklistStage(null)).toBe(1);
    expect(checklistStage(0)).toBe(0);
    expect(checklistStage(4)).toBe(4);
  });
});

describe("web's old \"I haven't arrived yet\" profiles (no date, stored stage 0)", () => {
  // The stored enum comes back from PostgREST as the string "0".
  it("keep the pre-arrival stage instead of becoming unknown", () => {
    expect(resolveProfileStage(null, "0", today)).toBe(0);
    expect(resolveProfileStage(null, 0, today)).toBe(0);
    expect(isAwaitingArrivalDate(null, "0")).toBe(true);
  });

  it("stay on the pre-arrival checklist, not the first-3-months one", () => {
    expect(checklistStage(resolveProfileStage(null, "0", today))).toBe(0);
  });

  it("are never rewritten by the stage-cache sync", () => {
    const stage = resolveProfileStage(null, "0", today);
    expect(stageCacheIsCurrent("0", stage)).toBe(true);
  });

  it("move to the computed stage once a date is set", () => {
    expect(resolveProfileStage("2026-12-01", "0", today)).toBe(0);
    expect(resolveProfileStage("2026-08-01T00:00:00+00:00", "0", today)).toBe(1);
    expect(stageCacheIsCurrent("0", 1)).toBe(false);
    expect(isAwaitingArrivalDate("2026-12-01", "0")).toBe(false);
  });

  it("does not apply to other dateless profiles, which follow mobile", () => {
    // Stored null (mobile's unknown) or any other stage: unknown -> stage 1 checklist.
    expect(resolveProfileStage(null, null, today)).toBeNull();
    expect(resolveProfileStage(null, "2", today)).toBeNull();
    expect(checklistStage(resolveProfileStage(null, null, today))).toBe(1);
    expect(stageCacheIsCurrent(null, null)).toBe(true);
    expect(stageCacheIsCurrent("2", null)).toBe(false);
  });
});
