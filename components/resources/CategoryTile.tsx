"use client";

import { useTranslation } from "react-i18next";
import type { PartnerCategory } from "@/types";
import {
  PARTNER_CATEGORY_COLORS,
  PARTNER_CATEGORY_TINTS,
  PARTNER_CATEGORY_ICONS,
  PARTNER_CATEGORY_LABEL_KEYS,
  PARTNER_CATEGORY_DESCRIPTION_KEYS,
} from "@/lib/resources/categories";

interface CategoryTileProps {
  category: PartnerCategory;
  partnerCount: number;
  onClick: () => void;
}

/** Colored grid tile for a resource category — opens the category's org list. */
export function CategoryTile({
  category,
  partnerCount,
  onClick,
}: CategoryTileProps) {
  const { t } = useTranslation();
  const color = PARTNER_CATEGORY_COLORS[category];
  const tint = PARTNER_CATEGORY_TINTS[category];
  const Icon = PARTNER_CATEGORY_ICONS[category];

  return (
    <button
      type="button"
      onClick={onClick}
      style={{ backgroundColor: tint }}
      className="group flex h-full flex-col gap-3 rounded-card border border-border-card/50 p-4 text-start transition-shadow duration-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
    >
      <span
        style={{ backgroundColor: color }}
        className="flex h-10 w-10 items-center justify-center rounded-xl text-white"
      >
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <span className="mt-auto block">
        <span className="block text-sm font-semibold leading-snug text-ink-secondary">
          {t(PARTNER_CATEGORY_LABEL_KEYS[category])}
        </span>
        <span className="mt-1 line-clamp-2 block text-xs leading-snug text-ink-muted">
          {t(PARTNER_CATEGORY_DESCRIPTION_KEYS[category])}
        </span>
        <span className="mt-1.5 block text-[11px] font-medium text-ink-tertiary">
          {t("resources.orgCount", { count: partnerCount })}
        </span>
      </span>
    </button>
  );
}
