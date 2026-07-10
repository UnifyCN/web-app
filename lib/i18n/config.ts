/**
 * i18n configuration shared by the client instance, the SSR root layout, and the
 * locale-parity CI script. Mirrors the mobile app's `i18n/index.ts` language set
 * so a user's choice syncs cross-device through the shared
 * `user_onboarding_profiles.preferred_language` column.
 */

/** Supported UI languages (code → native display label). Same four as mobile. */
export const SUPPORTED_LANGUAGES = {
  en: "English",
  vi: "Tiếng Việt",
  es: "Español",
  hi: "हिन्दी",
} as const;

export type SupportedLanguage = keyof typeof SUPPORTED_LANGUAGES;

export const DEFAULT_LANGUAGE: SupportedLanguage = "en";

/** localStorage key — identical to the mobile app's, kept for parity. */
export const LANGUAGE_STORAGE_KEY = "user_preferred_language";

/**
 * Cookie the server root layout reads to render the correct `<html lang>` and
 * seed the client i18n instance on the first paint — avoids a flash of English
 * and a hydration mismatch. Web-specific (mobile has no SSR).
 */
export const LANGUAGE_COOKIE = "unify_lang";

export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return typeof value === "string" && value in SUPPORTED_LANGUAGES;
}

/**
 * Pick the best supported language from an `Accept-Language` header value so a
 * brand-new visitor (no cookie yet) still gets their browser language on the
 * first server render. Returns undefined when nothing matches.
 */
export function negotiateLanguage(
  acceptLanguage: string | null | undefined,
): SupportedLanguage | undefined {
  if (!acceptLanguage) return undefined;
  for (const part of acceptLanguage.split(",")) {
    const code = part.trim().split(";")[0]?.trim().toLowerCase();
    if (!code) continue;
    const base = code.split("-")[0];
    if (isSupportedLanguage(base)) return base;
  }
  return undefined;
}
