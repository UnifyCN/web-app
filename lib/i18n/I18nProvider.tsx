"use client";

import { useEffect, useState } from "react";
import { I18nextProvider } from "react-i18next";
import { createI18n, persistLocale, readStoredLocale } from "./index";
import { type SupportedLanguage } from "./config";

/**
 * Client i18n provider. Initialized with the locale the server resolved
 * (cookie → Accept-Language → 'en'), so the first client render matches the
 * server HTML exactly — no hydration mismatch, no flash of English.
 *
 * After mount it self-heals a cookie/localStorage disagreement: a returning
 * user whose explicit localStorage choice predates the cookie gets that choice
 * honoured, and the cookie is (re)written so subsequent SSR stays consistent.
 */
export function I18nProvider({
  initialLocale,
  children,
}: {
  initialLocale: SupportedLanguage;
  children: React.ReactNode;
}) {
  const [i18n] = useState(() => createI18n(initialLocale));

  useEffect(() => {
    const stored = readStoredLocale();
    if (stored && stored !== i18n.language) {
      // localStorage disagrees with the SSR cookie → trust the explicit choice
      // and re-sync the cookie for future renders.
      persistLocale(stored);
      void i18n.changeLanguage(stored);
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
