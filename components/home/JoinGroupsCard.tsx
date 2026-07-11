"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";

/**
 * Promo card shown on the Home feed's Groups tab — nudges the user toward
 * the Community section. Decorative arcs are clipped by `overflow-hidden`.
 */
export function JoinGroupsCard() {
  const { t } = useTranslation();
  return (
    <Link
      href="/community"
      className="relative block overflow-hidden rounded-card border border-border-card bg-surface-gray px-6 py-8 text-center transition-colors hover:bg-surface-input"
    >
      {/* Decorative arcs */}
      <span
        aria-hidden
        className="pointer-events-none absolute -left-9 -top-9 h-24 w-24 rounded-full border-[6px] border-primary-light/50"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-12 -right-10 h-32 w-32 rounded-full border-[6px] border-primary/40"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-5 left-5 h-16 w-16 rounded-full border-2 border-dashed border-mention-blue/40"
      />
      <div className="relative">
        <p className="text-base font-bold text-ink-secondary">
          {t("home.joinGroups")}
        </p>
        <p className="mt-1 text-sm text-ink-muted">
          {t("news.moreToCheckOut")}
        </p>
      </div>
    </Link>
  );
}
