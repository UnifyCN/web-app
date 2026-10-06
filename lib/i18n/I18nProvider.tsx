"use client";

import { use, useEffect, useState } from "react";
import { I18nextProvider } from "react-i18next";
import {
  createI18n,
  ensureLocale,
  loadLocale,
  persistLocale,
  readStoredLocale,
} from "./index";
import { DEFAULT_LANGUAGE, type SupportedLanguage } from "./config";

/**
 * Client i18n provider. Initialized with the locale the server resolved
 * (cookie → Accept-Language → 'en'), so the first client render matches the
 * server HTML exactly — no hydration mismatch, no flash of English.
 *
 * After mount it self-heals a cookie/localStorage disagreement: a returning
 * user whose explicit localStorage choice predates the cookie gets that choice
 * honoured, and the cookie is (re)written so subsequent SSR stays consistent.
 *
 * Only English is in the main bundle; any other language is its own chunk. When
 * the page is in one of those, rendering waits here for that chunk (`use`), on
 * the server and again while the browser hydrates. The server HTML is already
 * in that language and stays on screen meanwhile, so nothing flashes in English
 * or as raw keys, and `<html lang dir>` comes from the server either way.
 */
export function I18nProvider({
  initialLocale,
  children,
}: {
  initialLocale: SupportedLanguage;
  children: React.ReactNode;
}) {
  if (initialLocale !== DEFAULT_LANGUAGE) use(loadLocale(initialLocale));
  const [i18n] = useState(() => createI18n(initialLocale));

  useEffect(() => {
    const stored = readStoredLocale();
    if (stored && stored !== i18n.language) {
      // localStorage disagrees with the SSR cookie → trust the explicit choice
      // and re-sync the cookie for future renders. Load its strings first: the
      // cookie, <html lang dir> and the text must all change together.
      void ensureLocale(i18n, stored)
        .then(() => {
          persistLocale(stored);
          return i18n.changeLanguage(stored);
        })
        .catch((error: unknown) => {
          console.error("i18n: stored language failed to load", error);
        });
    } else {
      // Ensure the cookie exists (e.g. first visit resolved via Accept-Language)
      // so the next server render is consistent with this one.
      persistLocale(i18n.language as SupportedLanguage);
    }
    // Run once on mount; i18n instance is stable for the tab's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
