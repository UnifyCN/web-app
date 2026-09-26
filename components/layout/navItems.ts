import React from "react";
import { User, Settings, Handshake, BriefcaseBusiness } from "lucide-react";
import { LearnIcon } from "@/components/icons/LearnIcon";
import { ChecklistIcon } from "@/components/icons/ChecklistIcon";
import { CompanionIcon } from "@/components/icons/CompanionIcon";
import { CommunityIcon } from "@/components/icons/CommunityIcon";
import { SocialIcon } from "@/components/icons/SocialIcon";

export interface NavItem {
  /** i18n key resolved with `t()` at render (labels can't be pre-translated in
   *  a plain module). */
  labelKey: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Shown in the desktop sidebar only, hidden from the mobile bottom nav
   *  (which is already at its 375px item ceiling). Used for web-first,
   *  width-hungry features like the split-screen Resume Builder. */
  desktopOnly?: boolean;
  /** Extra path prefixes that also mark the item active — lets one nav item
   *  own several sibling routes (Job tools covers /resume + /cover-letter). */
  matchPrefixes?: string[];
}

// Shared by the desktop left sidebar (Sidebar.tsx) and the mobile bottom nav
// (BottomNav.tsx) so the two stay in sync. Order + icons mirror the mobile
// app's bottom-tab nav (Learn → Checklist → Companion → Community → Social);
// mobile has no Home tab — its Social tab is the post feed, served at /home.
// Resources is a web addition (mobile nests it inside Learn); it sits next to
// Community as an outbound trusted-services directory. This makes the mobile
// BottomNav 7 items (6 primary + Settings) — verified acceptable at 375px.
// Job tools groups the Resume Builder and Cover Letter generator under one
// desktop-only item; both pages carry a JobToolsTabs strip to switch between them.
export const MAIN_NAV: NavItem[] = [
  { labelKey: "tabs.learn", href: "/learn", icon: LearnIcon },
  { labelKey: "tabs.checklist", href: "/checklist", icon: ChecklistIcon },
  { labelKey: "tabs.companion", href: "/companion", icon: CompanionIcon },
  {
    labelKey: "tabs.jobTools",
    href: "/resume",
    icon: BriefcaseBusiness,
    desktopOnly: true,
    matchPrefixes: ["/resume", "/cover-letter"],
  },
  { labelKey: "tabs.community", href: "/community", icon: CommunityIcon },
  { labelKey: "tabs.resources", href: "/resources", icon: Handshake },
  { labelKey: "tabs.social", href: "/home", icon: SocialIcon },
];

export const PROFILE_ITEM: NavItem = {
  labelKey: "profile.title",
  href: "/profile",
  icon: User,
};
export const SETTINGS_ITEM: NavItem = {
  labelKey: "settings.title",
  href: "/settings",
  icon: Settings,
};

/** Active when the path equals the href or is nested under it. */
export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Active check for a nav item, honouring its `matchPrefixes` when set. */
export function isItemActive(pathname: string, item: NavItem): boolean {
  return (item.matchPrefixes ?? [item.href]).some((href) =>
    isNavItemActive(pathname, href),
  );
}
