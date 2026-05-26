import type { AuthError, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

/**
 * Auth data access. Browser-side only — every call goes through the shared
 * `createClient()` singleton so the Supabase session/token stays consistent
 * with the rest of the app.
 */

export async function signInWithGoogle(): Promise<{ error: AuthError | null }> {
  const supabase = createClient();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  });
  return { error };
}

export async function signOut(): Promise<{ error: AuthError | null }> {
  const supabase = createClient();
  const { error } = await supabase.auth.signOut();
  return { error };
}

export async function getAuthUser(): Promise<User | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
