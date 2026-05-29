import type { Persona, UserOnboardingProfile } from "@/types";
import type { SaveOnboardingInput } from "@/services/onboarding";

/**
 * Client-side wizard state. `arrivalDate` is split into a month/year picker
 * plus a "haven't arrived" flag; it's recombined into `YYYY-MM-01` on save.
 * `province` holds the 2-letter code (e.g. "ON").
 */
export interface OnboardingDraft {
  persona: Persona | null;
  arrivalMonth: number | null; // 1–12
  arrivalYear: number | null;
  notArrived: boolean;
  city: string;
  province: string;
  goals: string[];
  learningInterests: string[];
}

export interface OnboardingStepProps {
  draft: OnboardingDraft;
  update: (patch: Partial<OnboardingDraft>) => void;
}

export const EMPTY_DRAFT: OnboardingDraft = {
  persona: null,
  arrivalMonth: null,
  arrivalYear: null,
  notArrived: false,
  city: "",
  province: "",
  goals: [],
  learningInterests: [],
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
    persona: draft.persona,
    arrivalDate: toArrivalDate(draft),
    city: draft.city,
    province: draft.province,
    goals: draft.goals,
    learningInterests: draft.learningInterests,
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
    persona: o.persona,
    arrivalMonth,
    arrivalYear,
    notArrived: o.arrivalDate === null,
    city: o.city ?? "",
    province: o.province ?? "",
    goals: o.goals ?? [],
    learningInterests: o.learningInterests ?? [],
  };
}
