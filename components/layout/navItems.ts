import { User, Settings } from "lucide-react";
import { LearnIcon } from "@/components/icons/LearnIcon";
import { ChecklistIcon } from "@/components/icons/ChecklistIcon";
import { CompanionIcon } from "@/components/icons/CompanionIcon";
import { CommunityIcon } from "@/components/icons/CommunityIcon";
import { SocialIcon } from "@/components/icons/SocialIcon";

export interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

// Shared by the desktop left sidebar (Sidebar.tsx) and the mobile bottom nav
// (BottomNav.tsx) so the two stay in sync. Order + icons mirror the mobile
// app's bottom-tab nav (Learn → Checklist → Companion → Community → Social);
// mobile has no Home tab — its Social tab is the post feed, served at /home.
export const MAIN_NAV: NavItem[] = [
  { label: "Learn", href: "/learn", icon: LearnIcon },
  { label: "Checklist", href: "/checklist", icon: ChecklistIcon },
  { label: "Companion", href: "/companion", icon: CompanionIcon },
  { label: "Community", href: "/community", icon: CommunityIcon },
  { label: "Social", href: "/home", icon: SocialIcon },
];

export const PROFILE_ITEM: NavItem = { label: "Profile", href: "/profile", icon: User };
export const SETTINGS_ITEM: NavItem = {
  label: "Settings",
  href: "/settings",
  icon: Settings,
};

/** Active when the path equals the href or is nested under it. */
export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
