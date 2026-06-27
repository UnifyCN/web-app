"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { UnifyLogo } from "@/components/UnifyLogo";
import { signOut as signOutService } from "@/services/auth";
import { trackUserSignedOut } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import {
  MAIN_NAV,
  PROFILE_ITEM,
  SETTINGS_ITEM,
  isNavItemActive,
  type NavItem,
} from "./navItems";

// Fixed-width icon rail with a label under each icon. Width is set so the full
// "unify" wordmark lockup fits comfortably at the top (lockup ratio ≈ 2.24, so a
// size-38 lockup is ~85px wide; its built-in padding leaves ~13px of visible
// breathing room each side) while staying as narrow as possible — the longest
// label ("Companion" / "Community") still fits the tile at text-xs.
const SIDEBAR_WIDTH = 100;

/**
 * Left sidebar — present on every (main) page, every breakpoint. Fixed width,
 * no collapse: each item is an icon stacked above its label.
 */
export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();

  const signOut = async () => {
    const { error } = await signOutService();
    if (error) {
      console.error("Sign out failed", error);
      return; // stay put rather than pretend the session is cleared
    }
    trackUserSignedOut();
    // Drop every cached query so the next session never flashes this user's
    // data, then go to the pre-login welcome screen (replace so Back can't
    // return to an authed page).
    queryClient.clear();
    router.replace("/welcome");
  };

  const isActive = (href: string) => isNavItemActive(pathname, href);

  // Shared vertical tile: centred icon above a small label.
  const tileClass =
    "flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-xs leading-tight transition-colors duration-150";

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
        // Hidden on mobile (< md) — replaced by the fixed BottomNav; a left
        // rail on a 375px phone would crush content to ~275px.
        "sticky top-0 hidden h-screen shrink-0 flex-col md:flex",
        "border-r border-border-card bg-surface",
      )}
    >
      {/* Logo — full "unify" wordmark lockup, centred in the rail. */}
      <div className="flex h-16 items-center justify-center">
        <Link href="/home" aria-label="Unify home" className="flex items-center">
          <UnifyLogo variant="lockup" size={38} priority />
        </Link>
      </div>

      {/* Primary navigation — vertically centred icon group */}
      <nav className="flex flex-1 flex-col justify-center gap-1.5 px-2">
        {MAIN_NAV.map(renderNavLink)}
      </nav>

      {/* Profile + sign out, separated by a border */}
      <div className="flex flex-col gap-1.5 border-t border-border-card px-2 py-3">
        {renderNavLink(PROFILE_ITEM)}
        {renderNavLink(SETTINGS_ITEM)}
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
