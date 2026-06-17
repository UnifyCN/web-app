/** Shared client-side auth validation. */

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Minimum password length enforced on signup + reset + change-password. */
export const MIN_PASSWORD_LENGTH = 8;

/** Cookie name carrying the signup-checkbox timestamp from /signup to
 *  /verify-email, so consent is stamped on the user row at account creation. A
 *  short-lived cookie (not sessionStorage) survives the cross-route hop more
 *  reliably and is cleared as soon as it's consumed. */
export const SIGNUP_CONSENT_KEY = "unify_signup_consent_at";

/** ~15 min — long enough to read the email and enter the code, short enough that
 *  a stale consent stamp never lingers. */
const SIGNUP_CONSENT_MAX_AGE = 900;

/** Persist the signup consent timestamp for the /verify-email step. Client-only. */
export function setSignupConsentCookie(value: string): void {
  if (typeof document === "undefined") return;
  const secure =
    typeof location !== "undefined" && location.protocol === "https:"
      ? "; Secure"
      : "";
  document.cookie = `${SIGNUP_CONSENT_KEY}=${encodeURIComponent(
    value,
  )}; Max-Age=${SIGNUP_CONSENT_MAX_AGE}; Path=/; SameSite=Lax${secure}`;
}

/** Read the signup consent timestamp, or undefined if absent. Client-only. */
export function readSignupConsentCookie(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const prefix = `${SIGNUP_CONSENT_KEY}=`;
  const hit = document.cookie
    .split("; ")
    .find((part) => part.startsWith(prefix));
  return hit ? decodeURIComponent(hit.slice(prefix.length)) : undefined;
}

/** Delete the signup consent cookie once it's been used. Client-only. */
export function clearSignupConsentCookie(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${SIGNUP_CONSENT_KEY}=; Max-Age=0; Path=/; SameSite=Lax`;
}

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}
