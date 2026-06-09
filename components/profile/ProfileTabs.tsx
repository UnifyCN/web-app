"use client";

import { Tabs } from "@/components/ui/Tabs";

/** Tabs for the current user's own profile. */
export const PROFILE_TABS = ["Posts", "Comments", "Saved", "Highlights"];
/** Tabs for another user's profile (Saved/Highlights are own-row only). */
export const OTHER_PROFILE_TABS = ["Posts", "Comments"];

interface ProfileTabsProps {
  activeTab: string;
  onChange: (tab: string) => void;
  /** Defaults to the own-profile tab set. */
  tabs?: string[];
}

export function ProfileTabs({
  activeTab,
  onChange,
  tabs = PROFILE_TABS,
}: ProfileTabsProps) {
  return <Tabs tabs={tabs} activeTab={activeTab} onChange={onChange} />;
}
