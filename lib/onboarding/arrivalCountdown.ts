import { getDaysUntilArrival } from "@/lib/onboarding/arrivalStage";
import { calculateUserStage } from "@/lib/onboarding/calculateUserStage";

/*
 * The Checklist's arrival countdown, as on mobile
 * (`helpers/arrivalDate.ts` `getArrivalCountdown`, mobile PR #346):
 * - before the arrival day: "N days until you land";
 * - from the arrival day through day 29 after it: "Your first 30 days";
 * - otherwise (30+ days after, or no usable date): hidden.
 * Days are whole local calendar days (tomorrow = 1), so the count changes at
 * the user's local midnight, never at UTC midnight. A month-only date is
 * stored as the 1st of that month, so it counts to the 1st.
 */

export type ArrivalCountdown =
  | { state: "pre_arrival"; days: number }
  | { state: "first_30_days" }
  | { state: "hidden" };

export const FIRST_PERIOD_DAYS = 30;

export function getArrivalCountdown(
  arrivalDate: string | null | undefined,
  today: Date = new Date(),
): ArrivalCountdown {
  const daysUntil = getDaysUntilArrival(arrivalDate, today);
  if (daysUntil === null) return { state: "hidden" };
  if (daysUntil > 0) return { state: "pre_arrival", days: daysUntil };
  if (-daysUntil < FIRST_PERIOD_DAYS) return { state: "first_30_days" };
  return { state: "hidden" };
}

/** Local calendar date as YYYY-MM-DD (never UTC). */
export function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Allowed arrival dates when changing it: 5 years back to 3 ahead, as on mobile. */
export const ARRIVAL_DATE_YEARS_BACK = 5;
export const ARRIVAL_DATE_YEARS_AHEAD = 3;

export function isArrivalDateInRange(value: string, today: Date = new Date()): boolean {
  const y = today.getFullYear();
  const min = formatLocalDate(
    new Date(y - ARRIVAL_DATE_YEARS_BACK, today.getMonth(), today.getDate()),
  );
  const max = formatLocalDate(
    new Date(y + ARRIVAL_DATE_YEARS_AHEAD, today.getMonth(), today.getDate()),
  );
  return value >= min && value <= max;
}

const SHOWN_PREFIX = "arrival_countdown_shown";

/**
 * Claims the once-a-day `arrival_countdown_shown` event for this user and local
 * day. True only the first time per user per day on this browser (mobile keeps
 * the same marker in AsyncStorage). Blocked storage claims once per page load.
 */
const claimedThisLoad = new Set<string>();
export function claimCountdownShown(userId: string, day: string): boolean {
  const key = `${SHOWN_PREFIX}:${userId}:${day}`;
  if (claimedThisLoad.has(key)) return false;
  claimedThisLoad.add(key);
  try {
    if (window.localStorage.getItem(key) !== null) return false;
    window.localStorage.setItem(key, "1");
  } catch {
    // Storage blocked: the in-memory claim above still limits it to once.
  }
  return true;
}

/**
 * Cross-tab version of claimCountdownShown. Two tabs of the same user can
 * both read an empty marker before either writes it, so the read and write
 * run inside an exclusive Web Lock shared by every tab of this origin
 * (Chrome 69+, Firefox 96+, Safari 15.4+). Without the Locks API it falls back
 * to claimCountdownShown.
 */
export async function claimCountdownShownAcrossTabs(
  userId: string,
  day: string,
  onClaimed?: () => void,
): Promise<boolean> {
  // `onClaimed` runs in the same step as the marker write, so a claimed day
  // always sends its event, even if the caller has gone away by then.
  const claim = () => {
    const claimed = claimCountdownShown(userId, day);
    if (claimed && onClaimed) {
      try {
        onClaimed();
      } catch (err) {
        console.warn("[arrivalCountdown] shown event failed", err);
      }
    }
    return claimed;
  };
  const locks =
    typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (!locks?.request) return claim();
  try {
    return await locks.request(`${SHOWN_PREFIX}:${userId}`, claim);
  } catch {
    return claim();
  }
}

/**
 * Whether the stage (and so the checklist) differs between two local days,
 * e.g. the night the user arrives (stage 0 -> 1). Days are YYYY-MM-DD.
 */
export function stageChangedOvernight(
  arrivalDate: string | null | undefined,
  previousDay: string,
  nextDay: string,
): boolean {
  if (!arrivalDate) return false;
  const at = (d: string) => {
    const [y, m, dd] = d.split("-").map(Number);
    return new Date(y, m - 1, dd, 12);
  };
  return (
    calculateUserStage(arrivalDate, at(previousDay)) !==
    calculateUserStage(arrivalDate, at(nextDay))
  );
}

/**
 * Once another account (or no account) is signed in, the dialog's owner is
 * forgotten, so switching back never reopens it by itself.
 */
export function shouldClearEditingFor(
  editingFor: string | null,
  signedInUserId: string | null,
): boolean {
  return editingFor !== null && editingFor !== signedInUserId;
}

/**
 * The countdown's date dialog is open only while the account it was opened
 * for is still the signed-in one; a different account closes it.
 */
export function isDialogOpenFor(
  editingFor: string | null,
  signedInUserId: string | null,
): boolean {
  return editingFor !== null && editingFor === signedInUserId;
}
