import type { Persona } from "@/types";
import {
  createClient,
  getAuthUserId,
  isSupabaseConfigured,
} from "@/lib/supabase/client";
import { calculateUserStage } from "@/lib/onboarding/calculateUserStage";

/**
 * Onboarding data access — a single upsert into `user_onboarding_profiles`.
 * Follows the Community pattern: `isSupabaseConfigured()` + `getAuthUserId()`
 * guards and a mock no-op so the wizard stays exercisable in the local /
 * env-not-configured build. The read path already lives in `getCurrentUser`.
 */

export interface SaveOnboardingInput {
  persona: Persona;
  /** `YYYY-MM-01`, or null for "haven't arrived yet". */
  arrivalDate: string | null;
  city: string;
  province: string;
  /** Enum slugs (see lib/onboarding/constants). */
  goals: string[];
  /** Enum slugs (see lib/onboarding/constants). */
  learningInterests: string[];
}

/**
 * Persist the onboarding profile. `stage` is computed from `arrivalDate`, and
 * the row's existence is what marks onboarding complete (no separate flag).
 * `onConflict: "id"` makes this idempotent and reusable for later edits.
 */
export async function saveOnboarding(input: SaveOnboardingInput): Promise<void> {
  if (!isSupabaseConfigured()) return; // mock build — no-op, wizard still flows

  const userId = await getAuthUserId();
  if (!userId) throw new Error("saveOnboarding: no auth session");

  const supabase = createClient();
  const stage = calculateUserStage(input.arrivalDate);

  const { error } = await supabase.from("user_onboarding_profiles").upsert(
    {
      id: userId, // = auth.uid(), satisfies the own-row RLS policy + PK
      persona: input.persona,
      arrival_date: input.arrivalDate,
      city: input.city.trim() || null,
      province: input.province.trim() || null,
      stage,
      goals: input.goals,
      learning_interests: input.learningInterests,
    },
    { onConflict: "id" },
  );
  if (error) throw error;
}
