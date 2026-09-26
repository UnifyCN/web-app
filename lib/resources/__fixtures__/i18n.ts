import i18next, { type TFunction } from "i18next";
import en from "@/lib/i18n/locales/en/translation.json";
import ar from "@/lib/i18n/locales/ar/translation.json";

/**
 * A synchronous i18next instance over the real locale bundles, configured like
 * the app (v3 JSON, EN fallback), for tests of localized Resources logic.
 */
export function makeT(lng: "en" | "ar"): TFunction {
  const instance = i18next.createInstance();
  void instance.init({
    lng,
    fallbackLng: "en",
    compatibilityJSON: "v3",
    initImmediate: false,
    interpolation: { escapeValue: false },
    resources: { en: { translation: en }, ar: { translation: ar } },
  });
  return instance.t;
}
