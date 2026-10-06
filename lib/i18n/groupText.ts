"use client";

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { i18n as I18nInstance } from "i18next";
import { DEFAULT_LANGUAGE } from "./config";

/* ------------------------------------------------------------------ *
 * Translated names and descriptions for the official community groups.
 *
 * Group text lives in the shared `groups` table in English only, and
 * neither app has a translated copy of it. The official groups are a
 * short, fixed list, so their translations ship in the locale files
 * under `officialGroups.<group id>`; the English entry there is a copy
 * of the database text.
 *
 * A translation is used only while the database text still matches
 * that English copy. A renamed or rewritten group, a group with no
 * entry (a newly approved request), and mock data whose ids overlap
 * all show the database text instead of a stale translation.
 * ------------------------------------------------------------------ */

type GroupField = "name" | "description";

const NAMESPACE = "translation";

/** Whitespace-insensitive, so a stray newline in the table still matches. */
function normalize(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function resource(
  i18n: I18nInstance,
  lang: string,
  groupId: number,
  field: GroupField,
): string | null {
  const value: unknown = i18n.getResource(
    lang,
    NAMESPACE,
    `officialGroups.${groupId}.${field}`,
  );
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** `text` in the active language, or `text` itself when there is no translation for it. */
export function localizeGroupField(
  i18n: I18nInstance,
  groupId: number,
  field: GroupField,
  text: string,
): string {
  const lang = i18n.resolvedLanguage ?? i18n.language;
  if (!text || !lang || lang === DEFAULT_LANGUAGE) return text;
  const source = resource(i18n, DEFAULT_LANGUAGE, groupId, field);
  if (!source || normalize(source) !== normalize(text)) return text;
  return resource(i18n, lang, groupId, field) ?? text;
}

export interface GroupText {
  /** A group's name in the active language. */
  groupName: (groupId: number, name: string) => string;
  /** A group's description in the active language. */
  groupDescription: (groupId: number, description: string) => string;
  /**
   * Whether `needle` (already lower-cased) is in the group's name, as stored
   * or as shown. Search matches both, so the English name still works in
   * every language.
   */
  nameMatches: (groupId: number, name: string, needle: string) => boolean;
}

export function useGroupText(): GroupText {
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? i18n.language;
  return useMemo<GroupText>(() => {
    const groupName = (groupId: number, name: string) =>
      localizeGroupField(i18n, groupId, "name", name);
    return {
      groupName,
      groupDescription: (groupId, description) =>
        localizeGroupField(i18n, groupId, "description", description),
      nameMatches: (groupId, name, needle) =>
        name.toLowerCase().includes(needle) ||
        groupName(groupId, name).toLowerCase().includes(needle),
    };
    // `lang` is read through `i18n`; listing it rebuilds on a language switch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i18n, lang]);
}
