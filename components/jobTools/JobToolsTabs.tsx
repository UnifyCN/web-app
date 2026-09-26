"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { isNavItemActive } from "@/components/layout/navItems";

const TABS = [
  { labelKey: "tabs.resume", href: "/resume" },
  { labelKey: "tabs.coverLetter", href: "/cover-letter" },
];

/**
 * Route tabs switching between the two Job tools (Resume Builder / Cover
 * Letter). The sidebar has one "Job tools" item for both, so this strip is
 * how users move between them. Styled like the `Tabs` underline primitive, but
 * each tab is a link so the URLs stay shareable.
 */
export function JobToolsTabs({ className }: { className?: string }) {
  const pathname = usePathname();
  const { t } = useTranslation();

  return (
    <nav
      aria-label={t("tabs.jobTools")}
      className={cn(
        "flex items-center gap-1 border-b border-border-card",
        className,
      )}
    >
      {TABS.map((tab) => {
        const active = isNavItemActive(pathname, tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative -mb-px border-b-2 px-5 py-3 text-sm transition-colors duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              active
                ? "border-primary font-semibold text-primary"
                : "border-transparent font-medium text-ink-inactive hover:text-ink",
            )}
          >
            {t(tab.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
