import type { LocalizedText } from "@/types";
import { DEFAULT_LANGUAGE } from "./config";

/* ------------------------------------------------------------------ *
 * Database text that carries its own translations.
 *
 * A few shared tables keep English in a plain column and the other
 * languages beside it in a jsonb column keyed by app language code
 * (`groups.name_i18n`, `groups.description_i18n`):
 *
 *   { "fr-CA": "...", "vi": "...", "es": "...", "ar": "...", "hi": "...", "pa": "..." }
 *
 * English is never read from the map. A missing column, language or
 * value falls back to the English text, so a row with no translations
 * (a newly added group) simply shows in English.
 * ------------------------------------------------------------------ */

/** A jsonb translations value as the API returned it, kept only if it is usable. */
export function toLocalizedText(raw: unknown): LocalizedText | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw))
    return null;
  const entries = Object.entries(raw).filter(
    (entry): entry is [string, string] =>
      typeof entry[1] === "string" && entry[1].trim().length > 0,
  );
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

/** `text` in `lang`, or `text` itself when there is no translation for it. */
export function pickLocalized(
  text: string,
  translations: LocalizedText | null | undefined,
  lang: string | undefined,
): string {
  if (!translations || !lang || lang === DEFAULT_LANGUAGE) return text;
  const translated = translations[lang];
  return typeof translated === "string" && translated.trim().length > 0
    ? translated
    : text;
}
