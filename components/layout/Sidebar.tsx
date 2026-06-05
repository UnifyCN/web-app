"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { User, LogOut } from "lucide-react";
import { LearnIcon } from "@/components/icons/LearnIcon";
import { ChecklistIcon } from "@/components/icons/ChecklistIcon";
import { CompanionIcon } from "@/components/icons/CompanionIcon";
import { CommunityIcon } from "@/components/icons/CommunityIcon";
import { SocialIcon } from "@/components/icons/SocialIcon";
import { UnifyLogo } from "@/components/UnifyLogo";
import { signOut as signOutService } from "@/services/auth";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

// Order + icons mirror the mobile app's bottom-tab nav (Learn → Checklist →
// Companion → Community → Social). Mobile has no Home tab; its Social tab is the
// post feed, which the web app serves at /home.
const TOP_NAV: NavItem[] = [
  { label: "Learn", href: "/learn", icon: LearnIcon },
  { label: "Checklist", href: "/checklist", icon: ChecklistIcon },
  { label: "Companion", href: "/companion", icon: CompanionIcon },
  { label: "Community", href: "/community", icon: CommunityIcon },
  { label: "Social", href: "/home", icon: SocialIcon },
];

const PROFILE_ITEM: NavItem = { label: "Profile", href: "/profile", icon: User };

// Fixed-width icon rail with a label under each icon. 88px sits between the old
// 64px (icon-only) and 220px (icon+label row) widths — wide enough for the
// longest label ("Companion" / "Community") without eating into content space.
const SIDEBAR_WIDTH = 88;

/**
 * Left sidebar — present on every (main) page, every breakpoint. Fixed width,
 * no collapse: each item is an icon stacked above its label.
 */
export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const signOut = async () => {
    const { error } = await signOutService();
    if (error) {
      console.error("Sign out failed", error);
      return; // stay put rather than pretend the session is cleared
    }
    router.push("/login");
  };

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  // Shared vertical tile: centred icon above a small label.
  const tileClass =
    "flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-[11px] leading-tight transition-colors duration-150";

  const renderNavLink = (item: NavItem) => {
    const active = isActive(item.href);
    const Icon = item.icon;

    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          tileClass,
          active
            ? "bg-primary-bg font-semibold text-primary"
            : "font-medium text-ink-muted hover:bg-surface-gray hover:text-ink",
        )}
      >
        <Icon className="h-5 w-5 shrink-0" />
        <span className="w-full truncate text-center">{item.label}</span>
      </Link>
    );
  };

  return (
    <aside
      style={{ width: SIDEBAR_WIDTH }}
      className={cn(
        "sticky top-0 flex h-screen shrink-0 flex-col",
        "border-r border-border-card bg-surface",
      )}
    >
      {/* Logo — the mark only; the wordmark lockup doesn't fit a narrow rail. */}
      <div className="flex h-16 items-center justify-center">
        <Link href="/home" aria-label="Unify home" className="flex items-center">
          <UnifyLogo variant="mark" size={32} priority />
        </Link>
      </div>

      {/* Primary navigation — vertically centred icon group */}
      <nav className="flex flex-1 flex-col justify-center gap-1.5 px-2">
        {TOP_NAV.map(renderNavLink)}
      </nav>

      {/* Profile + sign out, separated by a border */}
      <div className="flex flex-col gap-1.5 border-t border-border-card px-2 py-3">
        {renderNavLink(PROFILE_ITEM)}
        <button
          type="button"
          onClick={signOut}
          className={cn(
            tileClass,
            "cursor-pointer font-medium text-ink-muted hover:bg-surface-gray hover:text-ink",
          )}
        >
          <LogOut className="h-5 w-5 shrink-0" />
          <span className="w-full truncate text-center">Sign out</span>
        </button>
      </div>
    </aside>
  );
}
