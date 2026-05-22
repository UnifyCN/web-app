import type { SupabaseClient, User } from "@supabase/supabase-js";

/**
 * Idempotently create the public.users row for an authenticated user. Single
 * source of truth for the bootstrap shape, shared by the OAuth callback and the
 * client-side self-heal in getCurrentUser. Mirrors db/triggers.sql — the
 * placeholder username uses a space (not `_`) to satisfy the schema's
 * ^[a-zA-Z0-9 ]{1,20}$ check.
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

  const { error } = await supabase.from("users").upsert(
    {
      id: user.id,
      email: user.email,
      username: `user ${user.id.replace(/-/g, "").slice(0, 12)}`,
    },
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (error) console.error("ensureUserRow failed", error);
  return error;
}
