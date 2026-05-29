import type { SupabaseClient, User } from "@supabase/supabase-js";
import { generateUsernameBase, usernameCandidates } from "@/lib/supabase/username";

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
 */
export async function ensureUserRow(supabase: SupabaseClient, user: User) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    console.error("ensureUserRow: no active session; cannot satisfy RLS");
    return new Error("no session");
  }

  // Try the friendly handle, then suffixed variants on a username collision.
  // ON CONFLICT (id) DO NOTHING means a row the user already has (e.g. renamed)
  // is left untouched; only a genuine new insert can hit the username UNIQUE.
  const candidates = usernameCandidates(generateUsernameBase(user), user.id);
  for (const username of candidates) {
    const { error } = await supabase.from("users").upsert(
      { id: user.id, email: user.email, username },
      { onConflict: "id", ignoreDuplicates: true },
    );
    if (!error) return null;
    if (error.code !== "23505") {
      console.error("ensureUserRow failed", error);
      return error;
    }
    // username taken by another user → try the next candidate
  }
  return null;
}
