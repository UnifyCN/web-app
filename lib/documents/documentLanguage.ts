/**
 * Document language for exported resumes + cover letters (PDF and DOCX).
 *
 * Exports follow the DOCUMENT's language, not the UI language: users apply to
 * Canadian employers, who expect English or French. So an Arabic (or Hindi, …)
 * UI still exports "EXPERIENCE", and a user can switch a draft to French to get
 * "EXPÉRIENCE". The on-screen editor keeps the UI language; only the print copy
 * and the .docx use this.
 *
 * The choice is remembered per draft in localStorage (no DB column exists for
 * it, and the resume/letter JSON round-trips through the AI edge functions, so
 * it stays out of the document data).
 */

import type { i18n as I18nInstance, TFunction } from "i18next";

export const DOCUMENT_LANGUAGES = ["en", "fr-CA"] as const;
export type DocumentLanguage = (typeof DOCUMENT_LANGUAGES)[number];
export const DEFAULT_DOCUMENT_LANGUAGE: DocumentLanguage = "en";

/** Native display names — shown as-is in every UI language. */
export const DOCUMENT_LANGUAGE_LABELS: Record<DocumentLanguage, string> = {
  en: "English",
  "fr-CA": "Français",
};

export type DocumentKind = "resume" | "coverLetter";

export function isDocumentLanguage(value: unknown): value is DocumentLanguage {
  return (
    typeof value === "string" &&
    (DOCUMENT_LANGUAGES as readonly string[]).includes(value)
  );
}

export function documentLanguageStorageKey(
  kind: DocumentKind,
  draftId: string,
): string {
  return `unify_doc_lang:${kind}:${draftId}`;
}

/** Stored choice for a draft, or English when unset / unreadable. */
export function readDocumentLanguage(key: string): DocumentLanguage {
  try {
    const stored = window.localStorage.getItem(key);
    return isDocumentLanguage(stored) ? stored : DEFAULT_DOCUMENT_LANGUAGE;
  } catch {
    return DEFAULT_DOCUMENT_LANGUAGE;
  }
}

export function writeDocumentLanguage(key: string, lang: DocumentLanguage) {
  try {
    window.localStorage.setItem(key, lang);
  } catch {
    // Private mode / storage disabled: the choice just won't persist.
  }
}

/**
 * A `t` bound to the document language, independent of the active UI language.
 * The language's strings must already be loaded: `useDocumentLanguage` only
 * reports a language once they are, so pass the language it gives you.
 */
export function documentT(i18n: I18nInstance, lang: DocumentLanguage): TFunction {
  return i18n.getFixedT(lang);
}
