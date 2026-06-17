import type { AuthError, PostgrestError, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { ensureUserRow } from "@/lib/supabase/ensureUserRow";

/**
 * Auth data access. Browser-side only — every call goes through the shared
 * `createClient()` singleton so the Supabase session/token stays consistent
 * with the rest of the app.
 *
 * Email verification + password reset mirror the mobile app: Supabase emails a
 * 6-digit code and the user enters it (`verifyOtp`), rather than a magic link.
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

export async function getAuthUser(): Promise<{
  user: User | null;
  error: AuthError | null;
}> {
  const supabase = createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  return { user, error };
}

/* ---- Email + password -------------------------------------------------- */

/**
 * Create an account. Supabase emails a 6-digit confirmation code; no session
 * exists until it's verified. With email confirmation on, a sign-up for an
 * already-registered address returns a decoy user with no identities (to avoid
 * leaking which emails exist) — surfaced via `alreadyRegistered`.
 */
export async function signUpWithEmail(
  email: string,
  password: string,
): Promise<{ error: AuthError | null; alreadyRegistered: boolean }> {
  const supabase = createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  const alreadyRegistered =
    !error && !!data.user && (data.user.identities?.length ?? 0) === 0;
  return { error, alreadyRegistered };
}

export async function signInWithEmail(
  email: string,
  password: string,
): Promise<{ error: AuthError | null }> {
  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return { error };
}

/**
 * Verify the signup code, then bootstrap the public.users row — stamping the
 * legal-consent timestamps captured at the signup checkbox (defaulting to now).
 */
export async function verifySignupOtp(
  email: string,
  token: string,
  consentAt?: string,
): Promise<{ error: AuthError | null }> {
  const supabase = createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "signup",
  });
  if (error) return { error };
  if (data.user) {
    const at = consentAt ?? new Date().toISOString();
    await ensureUserRow(supabase, data.user, {
      privacyPolicyAcceptedAt: at,
      communityGuidelinesAcceptedAt: at,
    });
    // The `handle_new_user` trigger pre-creates public.users at signUp, so the
    // upsert above (ON CONFLICT DO NOTHING) can't stamp consent — set it
    // explicitly so the proxy consent gate is satisfied. Own-row RLS allows it;
    // guard on null so a real prior acceptance is never overwritten.
    await supabase
      .from("users")
      .update({
        privacy_policy_accepted_at: at,
        community_guidelines_accepted_at: at,
      })
      .eq("id", data.user.id)
      .is("privacy_policy_accepted_at", null);
  }
  return { error: null };
}

/** Re-send the signup confirmation code. */
export async function resendSignupOtp(
  email: string,
): Promise<{ error: AuthError | null }> {
  const supabase = createClient();
  const { error } = await supabase.auth.resend({ type: "signup", email });
  return { error };
}

/* ---- Password reset ---------------------------------------------------- */

/** Email a recovery code. */
export async function sendPasswordReset(
  email: string,
): Promise<{ error: AuthError | null }> {
  const supabase = createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  return { error };
}

/** Verify the recovery code, then set the new password (`updateUser`). */
export async function resetPasswordWithOtp(
  email: string,
  token: string,
  newPassword: string,
): Promise<{ error: AuthError | null }> {
  const supabase = createClient();
  const { error: otpError } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "recovery",
  });
  if (otpError) return { error: otpError };
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  return { error };
}

/* ---- Account (settings) ------------------------------------------------ */

export async function updatePassword(
  newPassword: string,
): Promise<{ error: AuthError | null }> {
  const supabase = createClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  return { error };
}

/**
 * Request an email change — Supabase emails a confirmation link to the new
 * address (and, if "Secure email change" is on, the old one too). The link
 * returns to our /auth/callback, which finishes the change and lands the user
 * back on /settings. The change is NOT applied until that link is clicked.
 *
 * `emailRedirectTo` is the bare callback URL with NO query string: Supabase
 * validates redirect_to against the Redirect URLs allowlist, and a query string
 * makes it miss the exact-match entry — Supabase then silently falls back to the
 * Site URL (which on this shared project is the mobile `exp://…`, opening
 * about:blank). The /settings routing comes from the email template's
 * `type=email_change` link instead (see supabase/email-templates/change-email.html).
 */
export async function requestEmailChange(
  newEmail: string,
): Promise<{ error: AuthError | null }> {
  const supabase = createClient();
  const { error } = await supabase.auth.updateUser(
    { email: newEmail },
    { emailRedirectTo: `${window.location.origin}/auth/callback` },
  );
  return { error };
}

/* ---- Delete account ---------------------------------------------------- */

/**
 * Permanently delete the signed-in user's account. Routes through the server
 * (`DELETE /api/account`), which validates the session and deletes the auth user
 * with the service-role key — the browser never sees that key. Throws on
 * failure so React Query surfaces it.
 */
export async function deleteAccount(): Promise<void> {
  const res = await fetch("/api/account", { method: "DELETE" });
  if (!res.ok) {
    let message = "Couldn't delete your account.";
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      /* non-JSON error body — keep the default message */
    }
    throw new Error(message);
  }
}

/* ---- Legal consent ----------------------------------------------------- */

/**
 * Record acceptance of the privacy policy + community guidelines on the signed-in
 * user's row (the "Before you continue" gate, primarily for OAuth users who never
 * saw the signup checkbox). Relies on the users update-own RLS policy.
 */
export async function acceptLegalConsent(): Promise<{
  error: AuthError | PostgrestError | null;
}> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) {
    return {
      error: {
        name: "AuthSessionMissingError",
        message: "No active session.",
      } as AuthError,
    };
  }
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("users")
    .update({
      privacy_policy_accepted_at: now,
      community_guidelines_accepted_at: now,
    })
    .eq("id", userId);
  return { error };
}
