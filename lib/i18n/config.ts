/**
 * i18n configuration shared by the client instance, the SSR root layout, and the
 * locale-parity CI script. Mirrors the mobile app's `i18n/index.ts` language set
 * so a user's choice syncs cross-device through the shared
 * `user_onboarding_profiles.preferred_language` column.
 */

/**
 * Supported UI languages (code → native display label). en/vi/es/hi mirror the
 * mobile app; `ar` (Arabic) is web-first (mobile has no Arabic yet) and RTL —
 * see RTL_LANGUAGES / dirForLanguage below. Arabic is gated out of the public
 * picker until its machine translation is native-reviewed (GATED_LANGUAGES).
 */
export const SUPPORTED_LANGUAGES = {
  en: "English",
  vi: "Tiếng Việt",
  es: "Español",
  hi: "हिन्दी",
  ar: "العربية",
  "fr-CA": "Français (canadien)",
} as const;

export type SupportedLanguage = keyof typeof SUPPORTED_LANGUAGES;

export const DEFAULT_LANGUAGE: SupportedLanguage = "en";

export type Direction = "ltr" | "rtl";

/** Right-to-left locales. Drives `<html dir>` (SSR) + `document.dir` (client). */
export const RTL_LANGUAGES = new Set<SupportedLanguage>(["ar"]);

/** Text direction for a language — used by the root layout and persistLocale(). */
export function dirForLanguage(lang: SupportedLanguage): Direction {
  return RTL_LANGUAGES.has(lang) ? "rtl" : "ltr";
}

/** True when the value is a supported RTL language (safe on unknown input). */
export function isRtlLanguage(value: unknown): boolean {
  return isSupportedLanguage(value) && RTL_LANGUAGES.has(value);
}

/**
 * Languages built + testable but hidden from the public picker until their
 * machine translation is native-reviewed, gated behind a flag: Arabic behind
 * NEXT_PUBLIC_ENABLE_ARABIC, Canadian French behind NEXT_PUBLIC_ENABLE_FRENCH.
 * They stay valid `SupportedLanguage`s (still typecheck, still resolve a
 * direction for RTL mirroring) but every path that could apply one as the
 * *active* render locale — SSR cookie resolution, the client localStorage
 * self-heal, Accept-Language negotiation, and restoring a DB-synced
 * `preferred_language` — checks `isLanguageEnabled` too, not just
 * `isSupportedLanguage`. A value can be a real `SupportedLanguage` yet
 * currently gated (e.g. synced from a build/device where the flag was on), so
 * validity alone isn't enough to apply it.
 */
const GATED_LANGUAGES = new Set<SupportedLanguage>(["ar", "fr-CA"]);

export function isLanguageEnabled(lang: SupportedLanguage): boolean {
  if (!GATED_LANGUAGES.has(lang)) return true;
  if (lang === "fr-CA") return process.env.NEXT_PUBLIC_ENABLE_FRENCH === "true";
  return process.env.NEXT_PUBLIC_ENABLE_ARABIC === "true";
}

/**
 * Languages offered in the UI picker (code → native label). Gated languages are
 * excluded unless their flag is on. Callers should still include the *active*
 * language so a `<select value>` always has a matching option.
 */
export function getSelectableLanguages(): Partial<
  Record<SupportedLanguage, string>
> {
  return Object.fromEntries(
    (Object.entries(SUPPORTED_LANGUAGES) as [SupportedLanguage, string][]).filter(
      ([code]) => isLanguageEnabled(code),
    ),
  );
}

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
    // French ships only as Canadian French, so any fr* (fr, fr-FR, fr-CA) maps to it —
    // but only while the gate is on, so a disabled catalog can't get auto-selected.
    if (base === "fr" && isLanguageEnabled("fr-CA")) return "fr-CA";
  }
  return undefined;
}
