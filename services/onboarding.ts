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
      persona: input.persona,
      referral_source: referralSource,
      arrival_date: input.arrivalDate,
      city: input.city.trim() || null,
      province: input.province.trim() || null,
      stage: String(stage), // mobile `stage` is a stage_enum ('0'..'4')
      goals,
      learning_interests: learningInterests,
      hobbies,
      wants_reminders: input.learningReminders,
      onboarding_completed: true, // mobile gates "onboarded" on this flag
    },
    { onConflict: "id" },
  );
  if (error) throw error;

  // First name lives on `users` (not the onboarding row) in the shared schema.
  // NOTE: two non-atomic writes (the onboarding upsert above, then this users
  // update). If the upsert succeeds but this fails, `onboarding_completed` is
  // true while `first_name` is left unchanged. Acceptable: the users row always
  // exists, and retrying the full save corrects it.
  const { error: nameError } = await supabase
    .from("users")
    .update({ first_name: input.firstName.trim() || null })
    .eq("id", userId);
  if (nameError) throw nameError;
}

/**
 * Update the user's first name (their profile's display name). First name lives
 * on the `users` row in the shared schema, so this is a one-column `users`
 * update. The users row is bootstrapped at sign-in, so a 0-row update is
 * unexpected — we request an exact count and throw rather than fail silently.
 * No-op in the mock build.
 */
export async function updateDisplayName(firstName: string): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const userId = await getAuthUserId();
  if (!userId) throw new Error("updateDisplayName: no auth session");

  const supabase = createClient();
  const { error, count } = await supabase
    .from("users")
    .update({ first_name: firstName.trim() || null }, { count: "exact" })
    .eq("id", userId);
  if (error) throw error;
  if (count === 0) {
    throw new Error("No user record found");
  }
}

/**
 * Partial update of the learning-reminders opt-in. `.update()` (not upsert);
 * with no onboarding row it matches 0 rows, so we request an exact count and
 * throw rather than fail silently. No-op in the mock build.
 */
export async function updateLearningReminders(enabled: boolean): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const userId = await getAuthUserId();
  if (!userId) throw new Error("updateLearningReminders: no auth session");

  const supabase = createClient();
  const { error, count } = await supabase
    .from("user_onboarding_profiles")
    .update({ wants_reminders: enabled }, { count: "exact" })
    .eq("id", userId);
  if (error) throw error;
  if (count === 0) {
    throw new Error("No onboarding profile found — complete your profile first");
  }
}
