import type {
  PostgrestError,
  SupabaseClient,
  User,
} from "@supabase/supabase-js";

/**
 * Display-name handling. Mirrors the mobile app's convention: `users.username`
 * is the one display identity shown everywhere, and a friendly handle is
 * derived at first sign-in (never the live Google name, which isn't available
 * for other users). The `users.username` column is `^[A-Za-z0-9 ]{1,20}$` and
 * UNIQUE, so handles are cleaned to fit and de-duplicated with a numeric suffix.
 */

/** The uuid-derived placeholder ensureUserRow used to seed; detected for self-heal. */
export const PLACEHOLDER_RE = /^user [0-9a-f]{12}$/;

/**
 * Charset + length constraint for `users.username` (mirrors the SQL CHECK
 * `^[A-Za-z0-9 ]{1,20}$`). Shared by the username editor's live validation and
 * the `updateUsername` service so the two never drift.
 */
export const USERNAME_RE = /^[A-Za-z0-9 ]{1,20}$/;

const MAX_LEN = 20;
const UNIQUE_VIOLATION = "23505";

/** The legacy placeholder for a given user id (also the last-resort fallback). */
function placeholderFor(userId: string): string {
  return `user ${userId.replace(/-/g, "").slice(0, 12)}`;
}

/** Coerce arbitrary text into the username charset: decompose + strip accents
 *  and disallowed chars, collapse whitespace, trim, cap at 20. */
function clean(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/\p{Mn}/gu, "") // drop combining diacritics (é → e)
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_LEN)
    .trim();
}

/** Friendly base handle: Google name → email local-part → uuid placeholder. */
export function generateUsernameBase(user: User): string {
  const meta = user.user_metadata ?? {};
  const rawName =
    typeof meta.full_name === "string"
      ? meta.full_name
      : typeof meta.name === "string"
        ? meta.name
        : "";

  const fromName = clean(rawName);
  if (fromName.length >= 2) return fromName;

  const fromEmail = user.email ? clean(user.email.split("@")[0]) : "";
  if (fromEmail.length >= 2) return fromEmail;

  return placeholderFor(user.id);
}

/** `base`, then ` 2`…` 6` suffixed variants (each fitted to ≤20 chars), then the
 *  guaranteed-unique uuid placeholder. */
export function usernameCandidates(base: string, userId: string): string[] {
  const list = [base];
  for (let n = 2; n <= 6; n++) {
    const suffix = ` ${n}`;
    list.push(`${base.slice(0, MAX_LEN - suffix.length).trim()}${suffix}`);
  }
  list.push(placeholderFor(userId));
  return list;
}

function isUniqueViolation(error: PostgrestError | null): boolean {
  return error?.code === UNIQUE_VIOLATION;
}

/**
 * UPDATE users.username to `base` (or a de-duplicated variant) for an existing
 * row — used to self-heal placeholder rows. Returns the value written, or null
 * if no candidate could be written (hard error / exhausted retries).
 */
export async function claimUsername(
  supabase: SupabaseClient,
  userId: string,
  base: string,
): Promise<string | null> {
  for (const candidate of usernameCandidates(base, userId)) {
    const { error } = await supabase
      .from("users")
      .update({ username: candidate })
      .eq("id", userId);
    if (!error) return candidate;
    if (!isUniqueViolation(error)) {
      console.error("claimUsername failed", error);
      return null;
    }
  }
  return null;
}
