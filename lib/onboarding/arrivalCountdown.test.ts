// Pin a zone west of UTC, where a late-evening local time is already the next
// day in UTC: the count must follow the local day. Vitest runs each test file
// in its own process, so this does not leak into other files.
process.env.TZ = "America/Vancouver";

import { afterEach, describe, expect, it } from "vitest";
import {
  claimCountdownShown,
  formatLocalDate,
  getArrivalCountdown,
  isArrivalDateInRange,
} from "./arrivalCountdown";
import { normalizeStoredArrivalDate } from "./arrivalStage";
import { resolveProfileStage } from "./calculateUserStage";

// Local wall-clock times in America/Vancouver.
const at = (y: number, m: number, d: number, h = 12, min = 0) =>
  new Date(y, m - 1, d, h, min);

describe("getArrivalCountdown", () => {
  it("runs in a non-UTC zone", () => {
    expect(at(2026, 11, 1).getTimezoneOffset()).not.toBe(0);
  });

  it("counts whole days to a future arrival", () => {
    expect(getArrivalCountdown("2026-12-15", at(2026, 11, 1))).toEqual({
      state: "pre_arrival",
      days: 44,
    });
    expect(getArrivalCountdown("2026-11-02", at(2026, 11, 1))).toEqual({
      state: "pre_arrival",
      days: 1,
    });
  });

  it("shows the first 30 days on the arrival day itself", () => {
    expect(getArrivalCountdown("2026-11-01", at(2026, 11, 1))).toEqual({
      state: "first_30_days",
    });
  });

  it("keeps the first 30 days through day 29, then hides", () => {
    expect(getArrivalCountdown("2026-10-03", at(2026, 11, 1))).toEqual({
      state: "first_30_days",
    }); // 29 days after
    expect(getArrivalCountdown("2026-10-02", at(2026, 11, 1))).toEqual({
      state: "hidden",
    }); // 30 days after
    expect(getArrivalCountdown("2024-05-01", at(2026, 11, 1))).toEqual({
      state: "hidden",
    });
  });

  it("counts a month-only date (stored as the 1st) to the 1st of that month", () => {
    expect(getArrivalCountdown("2027-03-01", at(2026, 11, 1))).toEqual({
      state: "pre_arrival",
      days: 120,
    });
    // Once that month has started, it is no longer a countdown.
    expect(getArrivalCountdown("2026-11-01", at(2026, 11, 20))).toEqual({
      state: "first_30_days",
    });
  });

  it("uses the local day late in the evening, not the UTC day", () => {
    // 23:30 on Nov 1 in Vancouver is already Nov 2 in UTC.
    const lateEvening = at(2026, 11, 1, 23, 30);
    expect(lateEvening.toISOString().slice(0, 10)).toBe("2026-11-02");
    expect(formatLocalDate(lateEvening)).toBe("2026-11-01");
    expect(getArrivalCountdown("2026-11-02", lateEvening)).toEqual({
      state: "pre_arrival",
      days: 1,
    });
    // One minute past local midnight: arrival day.
    expect(getArrivalCountdown("2026-11-02", at(2026, 11, 2, 0, 1))).toEqual({
      state: "first_30_days",
    });
  });

  it("reads a stored timestamptz by its calendar date", () => {
    const stored = normalizeStoredArrivalDate("2026-12-01T00:00:00+00:00");
    expect(stored).toBe("2026-12-01");
    expect(getArrivalCountdown(stored, at(2026, 11, 30, 22, 0))).toEqual({
      state: "pre_arrival",
      days: 1,
    });
  });

  it("is hidden for users without a usable arrival date", () => {
    expect(getArrivalCountdown(null, at(2026, 11, 1))).toEqual({ state: "hidden" });
    expect(getArrivalCountdown(undefined, at(2026, 11, 1))).toEqual({ state: "hidden" });
    expect(getArrivalCountdown("not-a-date", at(2026, 11, 1))).toEqual({
      state: "hidden",
    });
  });

  it("is hidden for web's dateless pre-arrival profiles (they get the prompt instead)", () => {
    // Stage 0 with no date: still pre-arrival for the checklist, but no card.
    expect(resolveProfileStage(null, "0")).toBe(0);
    expect(getArrivalCountdown(null, at(2026, 11, 1))).toEqual({ state: "hidden" });
  });

  it("is hidden for settled users", () => {
    expect(getArrivalCountdown("2025-01-01", at(2026, 11, 1))).toEqual({
      state: "hidden",
    });
  });
});

describe("isArrivalDateInRange", () => {
  it("allows 5 years back to 3 years ahead", () => {
    const today = at(2026, 11, 1);
    expect(isArrivalDateInRange("2021-11-01", today)).toBe(true);
    expect(isArrivalDateInRange("2021-10-31", today)).toBe(false);
    expect(isArrivalDateInRange("2029-11-01", today)).toBe(true);
    expect(isArrivalDateInRange("2029-11-02", today)).toBe(false);
  });
});

describe("claimCountdownShown", () => {
  const g = globalThis as unknown as { window?: unknown };
  afterEach(() => {
    delete g.window;
  });

  it("claims once per user per local day", () => {
    const store = new Map<string, string>();
    g.window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
      },
    };
    expect(claimCountdownShown("u1", "2026-11-01")).toBe(true);
    expect(claimCountdownShown("u1", "2026-11-01")).toBe(false);
    expect(claimCountdownShown("u2", "2026-11-01")).toBe(true);
    expect(claimCountdownShown("u1", "2026-11-02")).toBe(true);
  });
});
