"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Smartphone } from "lucide-react";
import { UnifyLogo } from "@/components/UnifyLogo";
import { cn } from "@/lib/utils";
import {
  MAIN_NAV,
  PROFILE_ITEM,
  SETTINGS_ITEM,
  isItemActive,
  type NavItem,
} from "./navItems";
import { navTourTarget } from "@/lib/whatsNew";
import { useMobileAppUrl } from "@/hooks/useMobileAppUrl";
import { usePrefetchTab } from "@/hooks/usePrefetchTab";

// Fixed-width icon rail with a label under each icon. Sized so the trimmed
// "unify" wordmark lockup reads at close to the Figma lockup size (35px visible
// height ≈ 117px wide, leaving ~12px each side) and long localized labels
// ("Communauté", "Paramètres") fit the tile at text-xs without truncating.
const SIDEBAR_WIDTH = 140;
const LOGO_HEIGHT = 35;

/**
 * Left sidebar — present on every (main) page, every breakpoint. Fixed width,
 * no collapse: each item is an icon stacked above its label. Sign out lives in
 * Settings (as on the mobile bottom nav), keeping the rail short.
 */
export function Sidebar() {
  const pathname = usePathname();
  const { t } = useTranslation();
  const mobileAppUrl = useMobileAppUrl();
  const prefetchTab = usePrefetchTab();

  // Shared vertical tile: centred icon above a small label.
  const tileClass =
    "flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-xs leading-tight press-dim";

  const renderNavLink = (item: NavItem) => {
    const active = isItemActive(pathname, item);
    const Icon = item.icon;

    return (
      <Link
        key={item.href}
        href={item.href}
        // Fetch the route ahead of the click, and warm the tab's data as soon
        // as the pointer or keyboard focus shows intent.
        prefetch
        onMouseEnter={() => void prefetchTab(item.href)}
        onFocus={() => void prefetchTab(item.href)}
        data-tour={navTourTarget(item.href)}
        aria-current={active ? "page" : undefined}
        className={cn(
          tileClass,
          active
            ? "bg-primary-bg font-semibold text-primary"
            : "font-medium text-ink-muted hover:bg-surface-gray hover:text-ink",
        )}
      >
        <Icon className="h-5 w-5 shrink-0" />
        <span className="w-full truncate text-center">{t(item.labelKey)}</span>
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
        // Logical border-inline-end: the divider follows the rail — right edge in
        // LTR, left edge when the flex row reverses under dir="rtl".
        "border-e border-border-card bg-surface",
      )}
    >
      {/* Logo — full "unify" wordmark lockup, centred in the rail. */}
      <div className="flex h-20 items-center justify-center">
        <Link
          href="/home"
          aria-label={t("nav.homeLinkLabel")}
          className="flex items-center"
        >
          <UnifyLogo variant="lockup" trim size={LOGO_HEIGHT} priority />
        </Link>
      </div>

      {/* Primary navigation — vertically centred icon group */}
      <nav className="flex flex-1 flex-col justify-center gap-1.5 px-2">
        {MAIN_NAV.map(renderNavLink)}
      </nav>

      {/* Profile + Settings + the mobile-app store link, separated by a border */}
      <div className="flex flex-col gap-1.5 border-t border-border-card px-2 py-3">
        {renderNavLink(PROFILE_ITEM)}
        {renderNavLink(SETTINGS_ITEM)}
        {/* Hidden on Android: there is no Play listing to send it to yet. */}
        {mobileAppUrl && (
          <a
            href={mobileAppUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              tileClass,
              "font-medium text-ink-muted hover:bg-surface-gray hover:text-ink",
            )}
          >
            <Smartphone className="h-5 w-5 shrink-0" />
            <span className="w-full truncate text-center">
              {t("nav.getApp")}
            </span>
          </a>
        )}
      </div>
    </aside>
  );
}
