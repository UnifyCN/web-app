"use client";

import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { cn, RTL_FLIP } from "@/lib/utils";
import { PartnerRow } from "./PartnerRow";
import { getPartnersByCategory } from "@/lib/resources/partners";
import {
  PARTNER_CATEGORY_LABEL_KEYS,
  PARTNER_CATEGORY_DESCRIPTION_KEYS,
  PARTNER_CATEGORY_COLORS,
} from "@/lib/resources/categories";
import type { PartnerCategory } from "@/types";

interface CategoryViewProps {
  category: PartnerCategory;
  onBack: () => void;
}

/** The org list for one category, with a back control to the category grid. */
export function CategoryView({ category, onBack }: CategoryViewProps) {
  const { t } = useTranslation();
  const partners = getPartnersByCategory(category);
  const color = PARTNER_CATEGORY_COLORS[category];

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-4 inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className={cn("h-4 w-4", RTL_FLIP)} aria-hidden />
        {t("resources.backToCategories")}
      </button>

      <div className="flex items-center gap-2.5">
        <span
          className="h-6 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
          aria-hidden
        />
        <h1 className="text-lg font-bold text-ink-secondary">
          {t(PARTNER_CATEGORY_LABEL_KEYS[category])}
        </h1>
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
        {t(PARTNER_CATEGORY_DESCRIPTION_KEYS[category])}
      </p>

      {partners.length === 0 ? (
        <p className="mt-6 text-sm text-ink-muted">
          {t("resources.noPartnersInCategory")}
        </p>
      ) : (
        <div className="mt-4 divide-y divide-border-card/50 overflow-hidden rounded-card border border-border-card/50 bg-surface p-1">
          {partners.map((partner) => (
            <PartnerRow key={partner.slug} partner={partner} />
          ))}
        </div>
      )}
    </div>
  );
}
