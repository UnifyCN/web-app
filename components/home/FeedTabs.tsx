"use client";

import { useTranslation } from "react-i18next";
import { Tabs } from "@/components/ui/Tabs";

/** Stable ids for the three Home feed tabs, in order — kept in state and
 *  compared against; labels are translated only at render. */
export const FEED_TABS = ["forYou", "following", "groups"] as const;
export type FeedTab = (typeof FEED_TABS)[number];

const FEED_TAB_LABEL_KEYS: Record<FeedTab, string> = {
  forYou: "home.forYou",
  following: "home.followingTab",
  groups: "home.groupsTab",
};

interface FeedTabsProps {
  activeTab: FeedTab;
  onChange: (tab: FeedTab) => void;
}

export function FeedTabs({ activeTab, onChange }: FeedTabsProps) {
  const { t } = useTranslation();
  // The shared Tabs primitive compares activeTab to the tabs array by string
  // equality, so hand it translated labels for both and map the change event
  // back to the stable id via the index (labels may not be unique).
  const labels = FEED_TABS.map((tab) => t(FEED_TAB_LABEL_KEYS[tab]));
  return (
    <Tabs
      tabs={labels}
      activeTab={labels[FEED_TABS.indexOf(activeTab)]}
      onChange={(_, index) => onChange(FEED_TABS[index])}
    />
  );
}
