import type { Stage } from "@/types";
import {
  getArrivalStage,
  normalizeStoredArrivalDate,
  resolveStoredStage,
} from "@/lib/onboarding/arrivalStage";

/**
 * The time-in-Canada {@link Stage} for a stored or wizard arrival date, by
 * mobile's rule (`arrivalStage.ts`, mobile #346/#349): whole calendar months
 * on the user's local day. A future date is 0 (pre-arrival), then
 * <3 months → 1 · <12 → 2 · <36 → 3 · else → 4.
 *
 * A missing or unreadable date is **unknown (null)**, not "not arrived": mobile
 * stores `stage = null` for it and shows the first-3-months checklist (see
 * {@link checklistStage}). For a stored row use {@link resolveProfileStage},
 * which keeps web's old dateless pre-arrival profiles on stage 0.
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

/**
 * The stage to use for a stored profile row.
 *
 * Normally the stage computed from the arrival date. One exception: a profile
 * with **no arrival date and a stored stage of 0** came from web's old "I
 * haven't arrived in Canada yet" option, which saved no date. Its stored
 * pre-arrival stage is kept (not turned into "unknown", which would move the
 * user to the first-3-months checklist) until the user sets a date; web asks
 * once for the arrival month (see ArrivalDatePrompt). Mobile always asks for a
 * date, so these rows exist only from web.
 */
export function resolveProfileStage(
  arrivalDate: string | null | undefined,
  storedStage: unknown,
  today: Date = new Date(),
): Stage | null {
  const computed = calculateUserStage(arrivalDate, today);
  if (computed === null && isAwaitingArrivalDate(arrivalDate, storedStage)) {
    return 0;
  }
  return computed;
}

/** A dateless profile with a stored pre-arrival stage (web's old "not arrived yet"). */
export function isAwaitingArrivalDate(
  arrivalDate: string | null | undefined,
  storedStage: unknown,
): boolean {
  return (
    normalizeStoredArrivalDate(arrivalDate) === null &&
    resolveStoredStage(storedStage) === 0
  );
}

/**
 * Whether the stored `stage` cache already matches the stage to use, so no
 * write is needed (mobile's `syncStageCache` check). A dateless pre-arrival
 * profile resolves to 0 and its stored "0" matches, so it is never rewritten.
 */
export function stageCacheIsCurrent(
  storedStage: unknown,
  stage: Stage | null,
): boolean {
  return stage === null
    ? storedStage === null || storedStage === undefined
    : resolveStoredStage(storedStage) === stage;
}
