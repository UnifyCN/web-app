"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { MAIN_NAV, SETTINGS_ITEM, isNavItemActive } from "./navItems";

// Mobile-only (< md) bottom tab bar — replaces the left sidebar on phones.
// The 5 primary tabs + Settings (6 total) — 7 was cramped on 375px. Profile is
// reached from within Settings (the "View your profile" row), and sign-out also
// lives in Settings, so the profile / settings / sign-out chain stays reachable.
const TABS = [...MAIN_NAV, SETTINGS_ITEM];

/**
 * Fixed bottom navigation shown only below the `md` breakpoint. Pads itself with
 * the iOS home-indicator inset; pages reserve matching space via the `<main>`
 * bottom padding in the (main) layout.
 */
export function BottomNav() {
  const pathname = usePathname();
  const { t } = useTranslation();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border-card bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {TABS.map((item) => {
        const active = isNavItemActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-[3.5rem] flex-1 flex-col items-center justify-center gap-1 px-0.5 py-2",
              "text-[10px] leading-tight transition-colors duration-150",
              active
                ? "font-semibold text-primary"
                : "font-medium text-ink-muted hover:text-ink",
            )}
          >
            <Icon className="h-5 w-5 shrink-0" />
            <span className="w-full truncate text-center">{t(item.labelKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
