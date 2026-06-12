import type { Persona } from "@/types";
import {
  createClient,
  getAuthUserId,
  isSupabaseConfigured,
} from "@/lib/supabase/client";
import { calculateUserStage } from "@/lib/onboarding/calculateUserStage";
import {
  GOAL_OPTIONS,
  HOBBY_OPTIONS,
  INTEREST_OPTIONS,
  REFERRAL_OPTIONS,
} from "@/lib/onboarding/constants";

// Allowed enum slugs — invalid values are rejected before the upsert so they
// never reach the DB (the columns are also CHECK/array-constrained in SQL).
const GOAL_VALUES = new Set<string>(GOAL_OPTIONS.map((o) => o.value));
const INTEREST_VALUES = new Set<string>(INTEREST_OPTIONS.map((o) => o.value));
const REFERRAL_VALUES = new Set<string>(REFERRAL_OPTIONS.map((o) => o.value));
const HOBBY_VALUES = new Set<string>(HOBBY_OPTIONS.map((o) => o.value));

/**
 * Onboarding data access — a single upsert into `user_onboarding_profiles`.
 * Follows the Community pattern: `isSupabaseConfigured()` + `getAuthUserId()`
 * guards and a mock no-op so the wizard stays exercisable in the local /
 * env-not-configured build. The read path already lives in `getCurrentUser`.
 */

export interface SaveOnboardingInput {
  /** First name; trimmed to null when empty. */
  firstName: string;
  persona: Persona;
  /** Referral slug (how they heard about Unify), or null if unanswered. */
  referralSource: string | null;
  /** `YYYY-MM-01`, or null for "haven't arrived yet". */
  arrivalDate: string | null;
  city: string;
  province: string;
  /** Enum slugs (see lib/onboarding/constants). */
  goals: string[];
  /** Enum slugs (see lib/onboarding/constants). */
  learningInterests: string[];
  /** Hobby slugs (see lib/onboarding/constants). */
  hobbies: string[];
  /** Opt-in to learning-reminder nudges. */
  learningReminders: boolean;
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

  // Reject any values outside the allowed enum lists.
  const goals = input.goals.filter((g) => GOAL_VALUES.has(g));
  const learningInterests = input.learningInterests.filter((i) =>
    INTEREST_VALUES.has(i),
  );
  const hobbies = input.hobbies.filter((h) => HOBBY_VALUES.has(h));
  const referralSource =
    input.referralSource && REFERRAL_VALUES.has(input.referralSource)
      ? input.referralSource
      : null;

  const { error } = await supabase.from("user_onboarding_profiles").upsert(
    {
      id: userId, // = auth.uid(), satisfies the own-row RLS policy + PK
      first_name: input.firstName.trim() || null,
      persona: input.persona,
      referral_source: referralSource,
      arrival_date: input.arrivalDate,
      city: input.city.trim() || null,
      province: input.province.trim() || null,
      stage,
      goals,
      learning_interests: learningInterests,
      hobbies,
      learning_reminders: input.learningReminders,
    },
    { onConflict: "id" },
  );
  if (error) throw error;
}

/**
 * Partial update of the onboarding first name (the profile's display name).
 * Uses `.update()` rather than upsert so NOT-NULL columns like `persona` are
 * never touched. NOTE: with no onboarding row this updates 0 rows silently, so
 * callers must gate on an existing row (`profile.onboarding != null`). No-op in
 * the mock build.
 */
export async function updateDisplayName(firstName: string): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const userId = await getAuthUserId();
  if (!userId) throw new Error("updateDisplayName: no auth session");

  const supabase = createClient();
  const { error } = await supabase
    .from("user_onboarding_profiles")
    .update({ first_name: firstName.trim() || null })
    .eq("id", userId);
  if (error) throw error;
}

/**
 * Partial update of the learning-reminders opt-in. `.update()` (not upsert);
 * 0 rows silently when no onboarding row exists — gate on `profile.onboarding`.
 * No-op in the mock build.
 */
export async function updateLearningReminders(enabled: boolean): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const userId = await getAuthUserId();
  if (!userId) throw new Error("updateLearningReminders: no auth session");

  const supabase = createClient();
  const { error } = await supabase
    .from("user_onboarding_profiles")
    .update({ learning_reminders: enabled })
    .eq("id", userId);
  if (error) throw error;
}
