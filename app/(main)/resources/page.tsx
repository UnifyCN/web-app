"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CategoryTile } from "@/components/resources/CategoryTile";
import { CategoryView } from "@/components/resources/CategoryView";
import { getCategoriesWithPartners } from "@/lib/resources/partners";
import {
  trackResourcesViewed,
  trackResourcesCategoryOpened,
} from "@/lib/analytics";
import type { PartnerCategory } from "@/types";

/**
 * Resources (Trusted Services) tab. Category grid → in-page category list
 * (mirrors the mobile app, where the category view is local state rather than a
 * route). Each partner opens its own route at `/resources/[slug]`.
 */
export default function ResourcesPage() {
  const { t } = useTranslation();
  const [active, setActive] = useState<PartnerCategory | null>(null);
  const categories = getCategoriesWithPartners();

  useEffect(() => {
    trackResourcesViewed();
  }, []);

  const openCategory = (category: PartnerCategory) => {
    trackResourcesCategoryOpened({ category });
    setActive(category);
  };

  return (
    <div className="mx-auto max-w-3xl animate-fade-in px-6 py-6 md:py-8">
      {active ? (
        <CategoryView category={active} onBack={() => setActive(null)} />
      ) : (
        <>
          <header className="mb-6">
            <h1 className="text-2xl font-bold text-ink-secondary">
              {t("resources.title")}
            </h1>
            <p className="mt-1 text-sm text-ink-muted">
              {t("resources.subtitle")}
            </p>
          </header>

          {categories.length === 0 ? (
            <div className="rounded-card border border-border-card/60 bg-surface-card px-6 py-12 text-center">
              <p className="text-sm font-semibold text-ink-secondary">
                {t("resources.emptyTitle")}
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                {t("resources.emptyText")}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {categories.map(({ category, partnerCount }) => (
                <CategoryTile
                  key={category}
                  category={category}
                  partnerCount={partnerCount}
                  onClick={() => openCategory(category)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
