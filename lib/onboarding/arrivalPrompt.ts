import type { UserOnboardingProfile } from "@/types";

/*
 * One-time arrival-month prompt for web's old "I haven't arrived in Canada yet"
 * profiles: no arrival date, stored stage 0 (see resolveProfileStage). Mobile
 * always asks for a date, so this brings those users in line with it. Asked
 * once per user on this browser; until they answer, they keep stage 0.
 */

const seenKey = (userId: string) => `unify_arrival_prompt_seen:${userId}`;

/** Whether this profile should be asked for its arrival month. */
export function needsArrivalPrompt(
  onboarding: Pick<UserOnboardingProfile, "arrivalDate" | "stage"> | null | undefined,
): boolean {
  return !!onboarding && onboarding.arrivalDate === null && onboarding.stage === 0;
}

export function hasSeenArrivalPrompt(userId: string): boolean {
  try {
    return window.localStorage.getItem(seenKey(userId)) === "1";
  } catch {
    // Storage blocked: treat as seen so the prompt can't reappear on every
    // page. The user keeps stage 0 and can set the month in Edit profile.
    return true;
  }
}

export function markArrivalPromptSeen(userId: string) {
  try {
    window.localStorage.setItem(seenKey(userId), "1");
  } catch {
    // ignore
  }
}

/** The stored `YYYY-MM-01` for a picked month. */
export function arrivalMonthToDate(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}
