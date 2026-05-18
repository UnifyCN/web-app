"use client";

import { Tabs } from "@/components/ui/Tabs";

/** Profile tabs for the current user's own profile. */
export const PROFILE_TABS = ["Posts", "Saved", "Highlights"];

interface ProfileTabsProps {
  activeTab: string;
  onChange: (tab: string) => void;
}

export function ProfileTabs({ activeTab, onChange }: ProfileTabsProps) {
  return (
    <Tabs tabs={PROFILE_TABS} activeTab={activeTab} onChange={onChange} />
  );
}
