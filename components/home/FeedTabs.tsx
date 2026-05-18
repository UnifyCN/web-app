"use client";

import { Tabs } from "@/components/ui/Tabs";

/** The three Home feed tabs, in order. */
export const FEED_TABS = ["For You", "Following", "Groups"];

interface FeedTabsProps {
  activeTab: string;
  onChange: (tab: string) => void;
}

export function FeedTabs({ activeTab, onChange }: FeedTabsProps) {
  return <Tabs tabs={FEED_TABS} activeTab={activeTab} onChange={onChange} />;
}
