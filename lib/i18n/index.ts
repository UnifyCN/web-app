import { createInstance, type i18n as I18nInstance } from "i18next";
import { initReactI18next } from "react-i18next";
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_COOKIE,
  LANGUAGE_STORAGE_KEY,
  SUPPORTED_LANGUAGES,
  dirForLanguage,
  isLanguageEnabled,
  isSupportedLanguage,
  type SupportedLanguage,
} from "./config";
import en from "./locales/en/translation.json";

/**
 * Locale bundles.
 *
 * English ships in the main bundle: it is the fallback for every other language
 * and the language most people use. The other six are separate chunks, loaded
 * only when they are needed, so nobody downloads and parses seven languages to
 * read one. Each is fetched once per page load (and once per server process)
 * and kept here.
 */
type TranslationBundle = Record<string, unknown>;
type LazyLanguage = Exclude<SupportedLanguage, "en">;

const NAMESPACE = "translation";

const loaders: Record<
  LazyLanguage,
  () => Promise<{ default: TranslationBundle }>
> = {
  vi: () => import("./locales/vi/translation.json"),
  es: () => import("./locales/es/translation.json"),
  hi: () => import("./locales/hi/translation.json"),
  ar: () => import("./locales/ar/translation.json"),
  "fr-CA": () => import("./locales/fr-CA/translation.json"),
  pa: () => import("./locales/pa/translation.json"),
};

const loadedBundles = new Map<SupportedLanguage, TranslationBundle>([
  [DEFAULT_LANGUAGE, en],
]);
const bundlePromises = new Map<SupportedLanguage, Promise<TranslationBundle>>([
  [DEFAULT_LANGUAGE, Promise.resolve(en)],
]);

/**
 * The bundle for a language, loading it if needed. Always returns the same
 * promise for the same language, which is what lets a component hand it to
 * React's `use()` (see I18nProvider). A failed load is forgotten so the next
 * call tries again.
 */
export function loadLocale(lang: SupportedLanguage): Promise<TranslationBundle> {
  const existing = bundlePromises.get(lang);
  if (existing) return existing;
  const promise = loaders[lang as LazyLanguage]()
    .then((module) => {
      loadedBundles.set(lang, module.default);
      return module.default;
    })
    .catch((error: unknown) => {
      bundlePromises.delete(lang);
      throw error;
    });
  bundlePromises.set(lang, promise);
  return promise;
}

/**
 * Makes sure an instance has a language's strings before that language is
 * shown. Call it (and await it) before switching language or rendering text in
 * a language other than the active one, so nothing ever falls back to English
 * or shows a raw key while the bundle is on its way.
 */
export async function ensureLocale(
  instance: I18nInstance,
  lang: SupportedLanguage,
): Promise<void> {
  if (instance.hasResourceBundle(lang, NAMESPACE)) return;
  const bundle = await loadLocale(lang);
  instance.addResourceBundle(lang, NAMESPACE, bundle, true, true);
}

/**
 * Create + synchronously initialize an i18next instance for the given language.
 *
 * It starts with every bundle that is already loaded: English always, plus the
 * active language, which the caller must have loaded first (I18nProvider does,
 * through `loadLocale`). Other languages are added on demand by
 * `ensureLocale`; `changeLanguage` does that by itself before it switches.
 *
 * A fresh instance per call keeps server-side rendering request-safe — no shared
 * mutable `language` bleeding across concurrent SSR requests. On the client the
 * provider creates it exactly once per tab (see I18nProvider).
 */
export function createI18n(lng: SupportedLanguage): I18nInstance {
  const resources = Object.fromEntries(
    [...loadedBundles].map(([lang, bundle]) => [
      lang,
      { [NAMESPACE]: bundle },
    ]),
  );
  const instance = createInstance();
  instance.use(initReactI18next).init({
    resources,
    lng,
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: Object.keys(SUPPORTED_LANGUAGES),
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

  // Every switch loads the target language first, whoever asks for it, so a
  // caller cannot switch to a language whose strings are not there yet.
  const switchLanguage = instance.changeLanguage.bind(instance);
  instance.changeLanguage = (async (
    next?: string,
    callback?: Parameters<typeof switchLanguage>[1],
  ) => {
    if (isSupportedLanguage(next)) await ensureLocale(instance, next);
    return switchLanguage(next, callback);
  }) as typeof instance.changeLanguage;

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
 * predates the cookie). Returns undefined when nothing valid is stored, or when
 * the stored choice is a currently-gated language — I18nProvider would otherwise
 * apply it AND rewrite the cookie with it, re-enabling a hidden/unreviewed
 * catalog client-side regardless of its feature flag.
 */
export function readStoredLocale(): SupportedLanguage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (isSupportedLanguage(stored) && isLanguageEnabled(stored)) return stored;
  } catch {
    // ignore
  }
  return undefined;
}
