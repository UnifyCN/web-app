import type { SupabaseClient, User } from "@supabase/supabase-js";
import { generateUsernameBase, usernameCandidates } from "@/lib/supabase/username";

/** Platform a user first signed up on (mirrors public.users.signup_source). */
export type SignupSource = "web" | "ios" | "android";

/**
 * Idempotently create the public.users row for an authenticated user. Single
 * source of truth for the bootstrap shape, shared by the OAuth callback and the
 * client-side self-heal in getCurrentUser. Seeds a friendly `username` derived
 * from the Google name (see lib/supabase/username), de-duplicated against the
 * UNIQUE constraint by trying suffixed candidates.
 *
 * Uses the passed client (a singleton on the browser, per-request on the
 * server), which carries the user's session — so the insert runs as the
 * authenticated user and satisfies the RLS policy
 * `users_insert_own (with check id = auth.uid())`.
 *
 * ignoreDuplicates → INSERT ... ON CONFLICT DO NOTHING, so a row the user has
 * already edited (e.g. renamed) is never overwritten.
 *
 * `signupSource` records the platform the user first signed up on ('web' here).
 * Pass it only from genuine signup entry points (the OAuth callback + email
 * verify) — not the self-heal — so returning/cross-platform users aren't
 * mislabelled. It is written with a guarded UPDATE (`.is(null)`) because the
 * shared handle_new_user trigger usually pre-creates the row, making the upsert
 * below a no-op; the guard also means a known source is never overwritten.
 */
export async function ensureUserRow(
  supabase: SupabaseClient,
  user: User,
  consent?: {
    privacyPolicyAcceptedAt?: string;
    communityGuidelinesAcceptedAt?: string;
  },
  signupSource?: SignupSource,
) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    console.error("ensureUserRow: no active session; cannot satisfy RLS");
    return new Error("no session");
  }

  // Legal-consent timestamps are only written on a brand-new insert (email
  // signup carries them; the OAuth callback omits them and lets the consent
  // gate collect them). ON CONFLICT DO NOTHING means an existing row is never
  // re-stamped here.
  const consentColumns = {
    ...(consent?.privacyPolicyAcceptedAt && {
      privacy_policy_accepted_at: consent.privacyPolicyAcceptedAt,
    }),
    ...(consent?.communityGuidelinesAcceptedAt && {
      community_guidelines_accepted_at: consent.communityGuidelinesAcceptedAt,
    }),
  };

  // signup_source is written on a genuine insert too, but the trigger normally
  // wins the race, so the guarded UPDATE below is what actually stamps it.
  const sourceColumns = signupSource ? { signup_source: signupSource } : {};

  // Try the friendly handle, then suffixed variants on a username collision.
  // ON CONFLICT (id) DO NOTHING means a row the user already has (e.g. renamed)
  // is left untouched; only a genuine new insert can hit the username UNIQUE.
  const candidates = usernameCandidates(generateUsernameBase(user), user.id);
  for (const username of candidates) {
    const { error } = await supabase.from("users").upsert(
      {
        id: user.id,
        email: user.email,
        username,
        ...consentColumns,
        ...sourceColumns,
      },
      { onConflict: "id", ignoreDuplicates: true },
    );
    if (!error) {
      // The trigger-created row makes the upsert a no-op, so stamp signup_source
      // explicitly. Guard on null: never overwrite a source already recorded
      // (e.g. a prior mobile signup).
      if (signupSource) {
        const { error: sourceError } = await supabase
          .from("users")
          .update({ signup_source: signupSource })
          .eq("id", user.id)
          .is("signup_source", null);
        if (sourceError) {
          console.error(
            "ensureUserRow: failed to stamp signup_source",
            sourceError,
          );
        }
      }
      return null;
    }
    if (error.code !== "23505") {
      console.error("ensureUserRow failed", error);
      return error;
    }
    // username taken by another user → try the next candidate
  }
  return null;
}
