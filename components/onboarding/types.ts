import type { Persona, UserOnboardingProfile } from "@/types";
import type { SaveOnboardingInput } from "@/services/onboarding";

/**
 * Client-side wizard state. `arrivalDate` is split into a month/year picker
 * plus a "haven't arrived" flag; it's recombined into `YYYY-MM-01` on save.
 * `province` holds the 2-letter code (e.g. "ON").
 */
export interface OnboardingDraft {
  firstName: string;
  persona: Persona | null;
  referralSource: string | null;
  arrivalMonth: number | null; // 1–12
  arrivalYear: number | null;
  notArrived: boolean;
  city: string;
  province: string;
  goals: string[];
  learningInterests: string[];
  hobbies: string[];
  learningReminders: boolean;
}

export interface OnboardingStepProps {
  draft: OnboardingDraft;
  update: (patch: Partial<OnboardingDraft>) => void;
  /** First-run vs edit-from-profile — lets steps vary their copy. */
  mode: "onboard" | "edit";
}

export const EMPTY_DRAFT: OnboardingDraft = {
  firstName: "",
  persona: null,
  referralSource: null,
  arrivalMonth: null,
  arrivalYear: null,
  notArrived: false,
  city: "",
  province: "",
  goals: [],
  learningInterests: [],
  hobbies: [],
  learningReminders: false,
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Recombine the picker fields into the stored `YYYY-MM-01`, or null. */
export function toArrivalDate(draft: OnboardingDraft): string | null {
  if (draft.notArrived) return null;
  if (draft.arrivalMonth && draft.arrivalYear) {
    return `${draft.arrivalYear}-${pad2(draft.arrivalMonth)}-01`;
  }
  return null;
}

/** Map the wizard draft to the service input (persona is guaranteed by the flow). */
export function draftToInput(draft: OnboardingDraft): SaveOnboardingInput {
  if (!draft.persona) throw new Error("draftToInput: persona is required");
  return {
    firstName: draft.firstName,
    persona: draft.persona,
    referralSource: draft.referralSource,
    arrivalDate: toArrivalDate(draft),
    city: draft.city,
    province: draft.province,
    goals: draft.goals,
    learningInterests: draft.learningInterests,
    hobbies: draft.hobbies,
    learningReminders: draft.learningReminders,
  };
}

/** Prefill the wizard from an existing profile (edit-from-profile flow). */
export function draftFromProfile(o: UserOnboardingProfile): OnboardingDraft {
  let arrivalMonth: number | null = null;
  let arrivalYear: number | null = null;
  if (o.arrivalDate) {
    const d = new Date(o.arrivalDate);
    if (!Number.isNaN(d.getTime())) {
      arrivalYear = d.getUTCFullYear();
      arrivalMonth = d.getUTCMonth() + 1;
    }
  }
  return {
    firstName: o.firstName ?? "",
    persona: o.persona,
    referralSource: o.referralSource ?? null,
    arrivalMonth,
    arrivalYear,
    notArrived: o.arrivalDate === null,
    city: o.city ?? "",
    province: o.province ?? "",
    goals: o.goals ?? [],
    learningInterests: o.learningInterests ?? [],
    hobbies: o.hobbies ?? [],
    learningReminders: o.learningReminders ?? false,
  };
}
