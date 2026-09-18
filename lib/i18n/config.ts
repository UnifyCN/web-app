/**
 * i18n configuration shared by the client instance, the SSR root layout, and the
 * locale-parity CI script. Mirrors the mobile app's `i18n/index.ts` language set
 * so a user's choice syncs cross-device through the shared
 * `user_onboarding_profiles.preferred_language` column.
 */

/**
 * Supported UI languages (code → native display label). `en`/`vi`/`es`/`hi`/
 * `ar`/`fr-CA` mirror the mobile app's `i18n/index.ts` exactly (mobile PR
 * #299); `ar` (Arabic) is RTL — see RTL_LANGUAGES / dirForLanguage below.
 * `pa` (Punjabi) is web-first, opt-in only, pending native review — see
 * isLanguageEnabled. `ar`/`fr-CA` can be hidden again with their kill-switch
 * env var (isLanguageEnabled).
 */
export const SUPPORTED_LANGUAGES = {
  en: "English",
  vi: "Tiếng Việt",
  es: "Español",
  hi: "हिन्दी",
  ar: "العربية",
  "fr-CA": "Français (canadien)",
  pa: "ਪੰਜਾਬੀ",
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
 * Arabic and Canadian French are ON by default — the mobile app ships them
 * ungated (mobile PR #299) and a user's `preferred_language` syncs across both
 * apps — with a kill-switch to hide either again (NEXT_PUBLIC_ENABLE_ARABIC /
 * NEXT_PUBLIC_ENABLE_FRENCH set to "false").
 *
 * Punjabi is the opposite: OFF by default, opt-in only. Its Sanity content
 * rollout is drafts-only pending native-speaker review (unlike ar/fr-CA,
 * which are already published on both apps), so it doesn't get the same
 * default as those two just because the code shape looks similar — set
 * NEXT_PUBLIC_ENABLE_PUNJABI to "true" to surface it for local testing. Do
 * not flip this on anywhere it would go live.
 *
 * A disabled language stays a valid `SupportedLanguage` (still typechecks,
 * still resolves a direction for RTL mirroring) but every path that could
 * apply it as the *active* render locale — SSR cookie resolution, the client
 * localStorage self-heal, Accept-Language negotiation, and restoring a
 * DB-synced `preferred_language` — checks `isLanguageEnabled` too, not just
 * `isSupportedLanguage`.
 */
export function isLanguageEnabled(lang: SupportedLanguage): boolean {
  if (lang === "ar") return process.env.NEXT_PUBLIC_ENABLE_ARABIC !== "false";
  if (lang === "fr-CA") return process.env.NEXT_PUBLIC_ENABLE_FRENCH !== "false";
  if (lang === "pa") return process.env.NEXT_PUBLIC_ENABLE_PUNJABI === "true";
  return true;
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
  // hasOwnProperty, not `in`: `in` walks the prototype chain, so "toString",
  // "constructor", "__proto__", etc. would wrongly pass as supported codes.
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(SUPPORTED_LANGUAGES, value)
  );
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
    // isLanguageEnabled here too, not just isSupportedLanguage: a gated catalog
    // (ar/fr-CA/pa, pending native review) must not get auto-selected for a
    // brand-new visitor just because their browser sends that Accept-Language —
    // the cookie/localStorage gate checks elsewhere don't help on a first visit.
    if (isSupportedLanguage(base) && isLanguageEnabled(base)) return base;
    // French ships only as Canadian French, so any fr* (fr, fr-FR, fr-CA) maps to it —
    // but only while the gate is on, so a disabled catalog can't get auto-selected.
    if (base === "fr" && isLanguageEnabled("fr-CA")) return "fr-CA";
  }
  return undefined;
}
