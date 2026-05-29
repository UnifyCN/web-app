import type { Stage } from "@/types";

/** Average milliseconds per month, matching the mobile app's stage math. */
const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30.44;

/**
 * Derive the time-in-Canada {@link Stage} from an arrival date.
 *
 * Mirrors the mobile app's `calculateUserStage`: a missing or future date is
 * stage 0 (not arrived yet); otherwise bucket by months since arrival.
 *
 *   null / future → 0 · <3mo → 1 · <12mo → 2 · <36mo → 3 · else → 4
 *
 * `arrivalDate` is the wizard's `YYYY-MM-01` string (month granularity), but
 * any Date-parseable string works; unparseable input falls back to stage 0.
 */
export function calculateUserStage(arrivalDate: string | null): Stage {
  if (!arrivalDate) return 0;

  const arrival = new Date(arrivalDate);
  if (Number.isNaN(arrival.getTime())) return 0;

  const months = (Date.now() - arrival.getTime()) / MS_PER_MONTH;
  if (months <= 0) return 0;
  if (months < 3) return 1;
  if (months < 12) return 2;
  if (months < 36) return 3;
  return 4;
}
