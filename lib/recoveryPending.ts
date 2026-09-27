/**
 * "Password recovery in progress" marker.
 *
 * Verifying the reset code signs the user in with a recovery session and uses
 * up the code. If saving the new password then fails (e.g. "should be different
 * from the old password"), the user must stay on /reset-password and retry the
 * password only — not wander into the app signed in with their OLD password.
 *
 * /reset-password sets this cookie (value = the user id) once the code is
 * verified and clears it when the password is saved or the user signs out.
 * `proxy.ts` reads it through `recoveryGate` to pin that user to
 * /reset-password. It is a UX gate, not a security boundary (the user can clear
 * the cookie; the session is a normal Supabase session either way).
 */
export const RECOVERY_COOKIE = "unify_recovery_pending";

/** Recovery sessions are short-lived; the marker never outlives one. */
const MAX_AGE_S = 60 * 60;

/** Client: remember that `userId` has a verified code but no new password yet. */
export function markRecoveryPending(userId: string): void {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${RECOVERY_COOKIE}=${encodeURIComponent(userId)}; Path=/; Max-Age=${MAX_AGE_S}; SameSite=Lax${secure}`;
}

/** Client: the pending user id, or "" when no recovery is in progress. */
export function readRecoveryPending(): string {
  if (typeof document === "undefined") return "";
  const hit = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${RECOVERY_COOKIE}=`));
  return hit ? decodeURIComponent(hit.slice(RECOVERY_COOKIE.length + 1)) : "";
}

/** Client: recovery finished or abandoned. */
export function clearRecoveryPending(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${RECOVERY_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

/**
 * Proxy decision for a signed-in request. While the marker matches the signed-in
 * user: `/reset-password` is allowed (instead of the usual signed-in bounce to
 * /home) and every other page redirects back to it. API and `/auth` routes are
 * left alone. `null` = no recovery in progress, carry on with the normal gates.
 */
export function recoveryGate(
  pathname: string,
  cookieValue: string | undefined,
  userId: string,
): "allow" | "redirect" | null {
  if (!cookieValue || cookieValue !== userId) return null;
  if (pathname === "/reset-password") return "allow";
  if (pathname.startsWith("/api/") || pathname.startsWith("/auth")) return null;
  return "redirect";
}
