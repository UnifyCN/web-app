import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * DELETE /api/account — permanently delete the signed-in user's account.
 *
 * Validates the caller's session with the cookie-based anon client (getUser
 * checks the JWT against the auth server), then deletes that user via the admin
 * API using the service-role key. It only ever deletes the session's OWN user
 * id, so there's no way to delete another account. App-table rows are removed by
 * their ON DELETE CASCADE foreign keys to auth.users. The service-role key never
 * leaves the server.
 */
export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError) {
    console.error("/api/account: getUser failed", authError);
  }
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("/api/account: SUPABASE_SERVICE_ROLE_KEY is not configured");
    return NextResponse.json(
      { error: "Account deletion isn't configured. Contact support." },
      { status: 500 },
    );
  }

  const admin = createAdminClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    console.error("/api/account: deleteUser failed", error);
    return NextResponse.json(
      { error: "Couldn't delete your account. Try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
