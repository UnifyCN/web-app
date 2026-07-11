"use client";

import { useTranslation } from "react-i18next";
import { Tabs } from "@/components/ui/Tabs";

/** Stable (non-translated) tab identifiers — safe to keep in state. */
export type ProfileTabKey = "posts" | "comments" | "saved" | "highlights";

/** Tab keys for the current user's own profile. */
export const PROFILE_TABS: ProfileTabKey[] = [
  "posts",
  "comments",
  "saved",
  "highlights",
];
/** Tab keys for another user's profile (Saved/Highlights are own-row only). */
export const OTHER_PROFILE_TABS: ProfileTabKey[] = ["posts", "comments"];

const TAB_LABEL_KEY: Record<ProfileTabKey, string> = {
  posts: "profile.posts",
  comments: "profile.comments",
  saved: "profile.saved",
  highlights: "profile.highlightsTab",
};

interface ProfileTabsProps {
  /** Stable tab key (e.g. "posts"), not the translated label. */
  activeTab: ProfileTabKey;
  onChange: (tab: ProfileTabKey) => void;
  /** Defaults to the own-profile tab set. */
  tabs?: ProfileTabKey[];
}

/**
 * Profile tab bar. State identity stays on the stable keys; the shared Tabs
 * primitive compares by label string, so we hand it translated labels and map
 * the change callback back to the key by index.
 */
export function ProfileTabs({
  activeTab,
  onChange,
  tabs = PROFILE_TABS,
}: ProfileTabsProps) {
  const { t } = useTranslation();
  const labels = tabs.map((key) => t(TAB_LABEL_KEY[key]));
  return (
    <Tabs
      tabs={labels}
      activeTab={t(TAB_LABEL_KEY[activeTab])}
      onChange={(label) => {
        const index = labels.indexOf(label);
        if (index !== -1) onChange(tabs[index]);
      }}
    />
  );
}
