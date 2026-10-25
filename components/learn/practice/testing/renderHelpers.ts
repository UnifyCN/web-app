import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInstance, type i18n as I18n } from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import ar from "@/lib/i18n/locales/ar/translation.json";
import en from "@/lib/i18n/locales/en/translation.json";
import es from "@/lib/i18n/locales/es/translation.json";
import frCA from "@/lib/i18n/locales/fr-CA/translation.json";
import hi from "@/lib/i18n/locales/hi/translation.json";
import pa from "@/lib/i18n/locales/pa/translation.json";
import vi from "@/lib/i18n/locales/vi/translation.json";
import type { FixtureLang } from "./reflectionFixtures";

/**
 * Test support: render a real component to static markup in one of the seven
 * languages, with the real translation bundles. Static markup shows what the
 * first render produces. It does not run handlers, effects or state updates.
 */

const BUNDLES: Record<FixtureLang, object> = {
  en,
  ar,
  es,
  "fr-CA": frCA,
  hi,
  pa,
  vi,
};

export function i18nFor(lang: FixtureLang): I18n {
  const instance = createInstance();
  void instance.use(initReactI18next).init({
    lng: lang,
    fallbackLng: "en",
    resources: {
      en: { translation: en },
      [lang]: { translation: BUNDLES[lang] },
    },
    interpolation: { escapeValue: false },
    initImmediate: false,
  });
  return instance;
}

export function renderIn(element: ReactElement, lang: FixtureLang = "en"): string {
  return renderToStaticMarkup(
    createElement(I18nextProvider, { i18n: i18nFor(lang) }, element),
  );
}

/** The `<button …>…</button>` segments of a markup string, in order. */
export function buttonsIn(html: string): string[] {
  return html.match(/<button[\s\S]*?<\/button>/g) ?? [];
}

/** Visible text of a markup string (tags removed, spaces collapsed). */
export function textIn(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
