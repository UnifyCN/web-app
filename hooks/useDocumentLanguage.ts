"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { ensureLocale } from "@/lib/i18n";
import {
  DEFAULT_DOCUMENT_LANGUAGE,
  documentLanguageStorageKey,
  readDocumentLanguage,
  writeDocumentLanguage,
  type DocumentKind,
  type DocumentLanguage,
} from "@/lib/documents/documentLanguage";

// In-tab change listeners (the `storage` event only fires in *other* tabs).
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * Per-draft export language (English / French), persisted in localStorage.
 * SSR + first client render agree on English, then it reads the stored choice.
 *
 * The export is written in this language whatever the interface language is,
 * so its strings may not be loaded yet (only English and the interface
 * language are). The stored choice is therefore reported only once its strings
 * are in: until then this answers English, so the print copy and the DOCX can
 * never mix French content with English headings.
 */
export function useDocumentLanguage(
  kind: DocumentKind,
  draftId: string,
): [DocumentLanguage, (lang: DocumentLanguage) => void] {
  const key = documentLanguageStorageKey(kind, draftId);
  const { i18n } = useTranslation();
  const stored = useSyncExternalStore(
    subscribe,
    () => readDocumentLanguage(key),
    () => DEFAULT_DOCUMENT_LANGUAGE,
  );
  const lang = useSyncExternalStore(
    subscribe,
    () =>
      i18n.hasResourceBundle(stored, "translation")
        ? stored
        : DEFAULT_DOCUMENT_LANGUAGE,
    () => DEFAULT_DOCUMENT_LANGUAGE,
  );

  // Load the stored language's strings, then tell subscribers to look again.
  useEffect(() => {
    if (i18n.hasResourceBundle(stored, "translation")) return;
    let cancelled = false;
    ensureLocale(i18n, stored)
      .then(() => {
        if (!cancelled) listeners.forEach((l) => l());
      })
      .catch((error: unknown) => {
        console.error("document language failed to load", error);
      });
    return () => {
      cancelled = true;
    };
  }, [i18n, stored]);

  const setLang = useCallback(
    (next: DocumentLanguage) => {
      writeDocumentLanguage(key, next);
      listeners.forEach((l) => l());
    },
    [key],
  );
  return [lang, setLang];
}
