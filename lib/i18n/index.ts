import { createInstance, type i18n as I18nInstance } from "i18next";
import { initReactI18next } from "react-i18next";
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_COOKIE,
  LANGUAGE_STORAGE_KEY,
  dirForLanguage,
  isSupportedLanguage,
  type SupportedLanguage,
} from "./config";
import en from "./locales/en/translation.json";
import vi from "./locales/vi/translation.json";
import es from "./locales/es/translation.json";
import hi from "./locales/hi/translation.json";
import ar from "./locales/ar/translation.json";
import frCA from "./locales/fr-CA/translation.json";

const resources = {
  en: { translation: en },
  vi: { translation: vi },
  es: { translation: es },
  hi: { translation: hi },
  ar: { translation: ar },
  "fr-CA": { translation: frCA },
} as const;

/**
 * Create + synchronously initialize an i18next instance for the given language.
 *
 * A fresh instance per call keeps server-side rendering request-safe — no shared
 * mutable `language` bleeding across concurrent SSR requests. On the client the
 * provider creates it exactly once per tab (see I18nProvider).
 */
export function createI18n(lng: SupportedLanguage): I18nInstance {
  const instance = createInstance();
  instance.use(initReactI18next).init({
    resources,
    lng,
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: Object.keys(resources),
    interpolation: {
      escapeValue: false,
      // v3 compat (below) disables i18next's modern built-in Intl formatters,
      // so `{{count, number}}` needs this legacy format hook to get
      // locale-aware digit grouping (e.g. es "1.234").
      format: (value, format, formatLng) =>
        format === "number" && typeof value === "number"
          ? new Intl.NumberFormat(formatLng).format(value)
          : String(value),
    },
    // The mobile app authored the JSON with i18next v3 plural suffixes
    // (`key_plural`); keep v3 compatibility so those files are reused verbatim.
    compatibilityJSON: "v3",
    react: { useSuspense: false },
    // Initialize synchronously so the very first render already has strings.
    initImmediate: false,
  });
  return instance;
}

/* ------------------------------------------------------------------ *
 * Client-only persistence (localStorage + a cookie mirror for SSR).
 * ------------------------------------------------------------------ */

/**
 * Set when the user actively picks a language this session (settings / welcome
 * picker). Lets the post-login DB sync tell "the user just chose this" apart
 * from "leftover localStorage from a previous run", so cross-device server-wins
 * behaviour is preserved. Resets on reload (module re-evaluates).
 */
let userPicked = false;
export function markUserPicked() {
  userPicked = true;
}
export function hasUserPickedThisSession() {
  return userPicked;
}

/**
 * Persist the chosen language to localStorage + a year-long cookie so the next
 * server render emits it directly. No-op on the server.
 */
export function persistLocale(lang: SupportedLanguage) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch {
    // Private mode / storage disabled — the cookie still carries the choice.
  }
  document.cookie = `${LANGUAGE_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`;
  // Keep <html lang> + <html dir> in sync on a client-side switch (SSR sets both
  // per request); `lang` matters for screen readers and `:lang()` CSS, and `dir`
  // flips the whole layout to RTL/LTR immediately — without it, switching to/from
  // Arabic would leave a stale direction until the next full reload.
  document.documentElement.lang = lang;
  document.documentElement.dir = dirForLanguage(lang);
}

/**
 * Best-guess client locale from localStorage — used once after mount to self-heal
 * a cookie/localStorage mismatch (e.g. a returning user whose stored choice
 * predates the cookie). Returns undefined when nothing valid is stored.
 */
export function readStoredLocale(): SupportedLanguage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (isSupportedLanguage(stored)) return stored;
  } catch {
    // ignore
  }
  return undefined;
}
