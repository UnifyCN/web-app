/** Password strength + common-password checks for the signup form. */

export type StrengthLevel =
  | "very-weak"
  | "weak"
  | "fair"
  | "strong"
  | "very-strong";

/**
 * A small set of the most common / breached passwords. Not exhaustive — enough
 * to warn on the obvious ones ("password123", "12345678", …).
 */
export const COMMON_PASSWORDS = new Set<string>([
  "password",
  "password1",
  "password12",
  "password123",
  "password1234",
  "passw0rd",
  "12345678",
  "123456789",
  "1234567890",
  "123456",
  "1234567",
  "qwerty",
  "qwerty123",
  "qwertyuiop",
  "1q2w3e4r",
  "abc123",
  "abc12345",
  "111111",
  "000000",
  "iloveyou",
  "letmein",
  "welcome",
  "welcome1",
  "admin",
  "admin123",
  "monkey",
  "dragon",
  "football",
  "baseball",
  "sunshine",
  "princess",
  "superman",
  "trustno1",
  "whatever",
  "starwars",
  "michael",
  "changeme",
  "login",
  "test1234",
]);

export function isCommonPassword(password: string): boolean {
  return COMMON_PASSWORDS.has(password.toLowerCase());
}

/**
 * Password strength from character variety, not just length — a long but
 * monotonous password (e.g. "test123456") stays weak. A common password is
 * always very-weak. Returns the level plus how many of the 5 bar segments to
 * fill.
 *
 *   very-weak    < 8 chars, OR only one character type (also: a common password)
 *   weak         8+ with lowercase + numbers only (no uppercase, no special)
 *   fair         8+ with an uppercase OR a special char, but not both
 *   strong       8+ with uppercase + numbers + special char
 *   very-strong  12+ with uppercase + numbers + special char
 */
export function passwordStrength(password: string): {
  level: StrengthLevel;
  filled: 0 | 1 | 2 | 3 | 4 | 5;
} {
  if (!password) return { level: "very-weak", filled: 0 };
  if (isCommonPassword(password)) return { level: "very-weak", filled: 1 };

  const lower = /[a-z]/.test(password);
  const upper = /[A-Z]/.test(password);
  const digit = /\d/.test(password);
  const special = /[^A-Za-z0-9]/.test(password);
  const types = [lower, upper, digit, special].filter(Boolean).length;

  // Too short or a single character class → very weak regardless of length.
  if (password.length < 8 || types <= 1) {
    return { level: "very-weak", filled: 1 };
  }
  // Full variety (upper + numbers + special): strong, or very strong at 12+.
  if (upper && special && digit) {
    return password.length >= 12
      ? { level: "very-strong", filled: 5 }
      : { level: "strong", filled: 4 };
  }
  // Exactly one of uppercase / special present → fair.
  if (upper || special) return { level: "fair", filled: 3 };
  // 8+ but only lowercase + numbers.
  return { level: "weak", filled: 2 };
}
