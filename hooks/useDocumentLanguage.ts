"use client";

import { useCallback, useSyncExternalStore } from "react";
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
 */
export function useDocumentLanguage(
  kind: DocumentKind,
  draftId: string,
): [DocumentLanguage, (lang: DocumentLanguage) => void] {
  const key = documentLanguageStorageKey(kind, draftId);
  const lang = useSyncExternalStore(
    subscribe,
    () => readDocumentLanguage(key),
    () => DEFAULT_DOCUMENT_LANGUAGE,
  );
  const setLang = useCallback(
    (next: DocumentLanguage) => {
      writeDocumentLanguage(key, next);
      listeners.forEach((l) => l());
    },
    [key],
  );
  return [lang, setLang];
}
