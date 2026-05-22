"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Home,
  Users,
  MessageCircle,
  CheckSquare,
  BookOpen,
  User,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { UnifyLogo } from "@/components/UnifyLogo";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const TOP_NAV: NavItem[] = [
  { label: "Home", href: "/home", icon: Home },
  { label: "Community", href: "/community", icon: Users },
  { label: "Companion", href: "/companion", icon: MessageCircle },
  { label: "Checklist", href: "/checklist", icon: CheckSquare },
  { label: "Learn", href: "/learn", icon: BookOpen },
];

const PROFILE_ITEM: NavItem = { label: "Profile", href: "/profile", icon: User };

/**
 * Left sidebar — present on every (main) page, every breakpoint.
 * Defaults to the 64px icon-only rail; the toggle expands it to 220px.
 */
export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(true);

  const signOut = async () => {
    await createClient().auth.signOut();
    router.push("/login");
  };

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  /** Shared item shape — a left-aligned square when collapsed, a row when not. */
  const itemShape = collapsed
    ? "h-10 w-10 justify-center"
    : "gap-3 px-3 py-2";

  const renderNavLink = (item: NavItem) => {
    const active = isActive(item.href);
    const Icon = item.icon;

    return (
      <Link
        key={item.href}
        href={item.href}
        title={collapsed ? item.label : undefined}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center rounded-lg text-sm transition-colors duration-150",
          itemShape,
          active
            ? "bg-primary-bg font-semibold text-primary"
            : "font-medium text-ink-muted hover:bg-surface-gray hover:text-ink",
        )}
      >
        <Icon className="h-5 w-5 shrink-0" />
        {!collapsed && <span className="truncate">{item.label}</span>}
      </Link>
    );
  };

  return (
    <aside
      style={{ width: collapsed ? 64 : 220 }}
      className={cn(
        "sticky top-0 flex h-screen shrink-0 flex-col",
        "border-r border-border-card bg-surface",
        "transition-all duration-200 ease-in-out",
      )}
    >
      {/* Logo */}
      <div className={cn("flex h-16 items-center", collapsed ? "px-3" : "px-4")}>
        <Link href="/home" aria-label="Unify home" className="flex items-center">
          {collapsed ? (
            <UnifyLogo variant="mark" size={32} priority />
          ) : (
            <UnifyLogo variant="lockup" size={36} priority />
          )}
        </Link>
      </div>

      {/* Primary navigation — vertically centred icon group */}
      <nav className="flex flex-1 flex-col justify-center gap-1.5 px-3">
        {TOP_NAV.map(renderNavLink)}
      </nav>

      {/* Profile + sign out, separated by a border */}
      <div className="flex flex-col gap-1.5 border-t border-border-card px-3 py-3">
        {renderNavLink(PROFILE_ITEM)}
        <button
          type="button"
          onClick={signOut}
          title={collapsed ? "Sign out" : undefined}
          className={cn(
            "flex items-center rounded-lg text-sm font-medium",
            "cursor-pointer text-ink-muted transition-colors duration-150 hover:bg-surface-gray hover:text-ink",
            itemShape,
          )}
        >
          <LogOut className="h-5 w-5 shrink-0" />
          {!collapsed && <span className="truncate">Sign out</span>}
        </button>
      </div>

      {/* Collapse / expand toggle */}
      <div className="border-t border-border-card px-3 py-3">
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "flex items-center rounded-lg text-sm font-medium",
            "cursor-pointer text-ink-muted transition-colors duration-150",
            "hover:bg-surface-gray hover:text-ink",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            collapsed ? "h-10 w-10 justify-center" : "w-full gap-3 px-3 py-2",
          )}
        >
          {collapsed ? (
            <ChevronRight className="h-5 w-5 shrink-0" />
          ) : (
            <>
              <ChevronLeft className="h-5 w-5 shrink-0" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
