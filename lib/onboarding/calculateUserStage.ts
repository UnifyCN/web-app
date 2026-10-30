import type { Stage } from "@/types";
import {
  getArrivalStage,
  normalizeStoredArrivalDate,
} from "@/lib/onboarding/arrivalStage";

/**
 * The time-in-Canada {@link Stage} for a stored or wizard arrival date, by
 * mobile's rule (`arrivalStage.ts`, mobile #346/#349): whole calendar months
 * on the user's local day. A future date is 0 (pre-arrival), then
 * <3 months → 1 · <12 → 2 · <36 → 3 · else → 4.
 *
 * A missing or unreadable date is **unknown (null)**, not "not arrived": mobile
 * stores `stage = null` for it and shows the first-3-months checklist (see
 * {@link checklistStage}).
 *
 * Accepts the wizard's `YYYY-MM-01` or the timestamptz the database returns
 * (`2026-12-01T00:00:00+00:00`, read as its UTC calendar date).
 */
export function calculateUserStage(
  arrivalDate: string | null | undefined,
  today: Date = new Date(),
): Stage | null {
  return getArrivalStage(normalizeStoredArrivalDate(arrivalDate), today);
}

/** Stage used to pick checklist content: unknown counts as just arrived (1), as on mobile. */
export function checklistStage(stage: Stage | null): Stage {
  return stage ?? 1;
}
