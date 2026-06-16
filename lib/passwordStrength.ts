/** Password strength + common-password checks for the signup form. */

export type StrengthLevel = "weak" | "medium" | "strong";

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
 * Rough strength score from length + character variety. A common password is
 * always weak. Returns the level plus how many of 3 bar segments to fill.
 */
export function passwordStrength(password: string): {
  level: StrengthLevel;
  filled: 0 | 1 | 2 | 3;
} {
  if (!password) return { level: "weak", filled: 0 };
  if (isCommonPassword(password)) return { level: "weak", filled: 1 };

  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 2) return { level: "weak", filled: 1 };
  if (score <= 3) return { level: "medium", filled: 2 };
  return { level: "strong", filled: 3 };
}
