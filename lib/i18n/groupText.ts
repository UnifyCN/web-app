"use client";

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { Group, LocalizedText } from "@/types";
import { pickLocalized } from "./localizedText";

/* ------------------------------------------------------------------ *
 * Group names and descriptions in the active language.
 *
 * The text and its translations both come from the shared `groups`
 * table (see localizedText.ts), so the two apps show the same thing
 * and a new group needs no app release. A group without a translation
 * for the active language shows its English text.
 * ------------------------------------------------------------------ */

type NamedGroup = Pick<Group, "groupName" | "nameI18n">;
type DescribedGroup = Pick<Group, "groupDescription" | "descriptionI18n">;

export interface GroupText {
  /** A group's name in the active language. */
  groupName: (group: NamedGroup) => string;
  /** A group's description in the active language. */
  groupDescription: (group: DescribedGroup) => string;
  /** The group label on a post, in the active language. */
  postGroupName: (name: string, nameI18n?: LocalizedText | null) => string;
  /**
   * Whether `needle` (already lower-cased) is in the group's name, as stored
   * or as shown. Search matches both, so the English name still works in
   * every language.
   */
  nameMatches: (group: NamedGroup, needle: string) => boolean;
}

export function useGroupText(): GroupText {
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? i18n.language;
  return useMemo<GroupText>(() => {
    const groupName = (group: NamedGroup) =>
      pickLocalized(group.groupName, group.nameI18n, lang);
    return {
      groupName,
      groupDescription: (group) =>
        pickLocalized(group.groupDescription, group.descriptionI18n, lang),
      postGroupName: (name, nameI18n) => pickLocalized(name, nameI18n, lang),
      nameMatches: (group, needle) =>
        group.groupName.toLowerCase().includes(needle) ||
        groupName(group).toLowerCase().includes(needle),
    };
  }, [lang]);
}
