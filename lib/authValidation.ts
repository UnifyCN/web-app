/** Shared client-side auth validation. */

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Minimum password length enforced on signup + reset + change-password. */
export const MIN_PASSWORD_LENGTH = 8;

/** sessionStorage key carrying the signup-checkbox timestamp from /signup to
 *  /verify-email, so consent is stamped on the user row at account creation. */
export const SIGNUP_CONSENT_KEY = "unify_signup_consent_at";

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}
