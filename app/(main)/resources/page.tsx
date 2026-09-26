"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CategoryTile } from "@/components/resources/CategoryTile";
import { FilterPill } from "@/components/resources/FilterPill";
import { HowWeChooseSheet } from "@/components/resources/HowWeChooseSheet";
import { PartnerResults } from "@/components/resources/PartnerResults";
import { ResourcesSearch } from "@/components/resources/ResourcesSearch";
import { filterValueLabel } from "@/components/resources/filterLabels";
import { useResourceFilters } from "@/hooks/useResourceFilters";
import { getCategoriesWithPartners } from "@/lib/resources/partners";
import { useResourcePartners } from "@/hooks/useResourcePartners";
import { PARTNER_CATEGORY_LABEL_KEYS } from "@/lib/resources/categories";
import {
  PREFERENCE_PILLS,
  applyFilters,
  hasActiveFilters,
} from "@/lib/resources/filters";
import { selectPartnersMatching } from "@/lib/resources/search";
import { trackResourcesViewed } from "@/lib/analytics";

/**
 * Resources front page (Figma 8681:503): header, search, preference pills, and
 * the category grid. A search or any filter swaps the grid for a
 * cross-category results list with the full filters panel.
 */
export default function ResourcesPage() {
  useEffect(() => {
    trackResourcesViewed();
  }, []);

  return (
    <div className="mx-auto w-full max-w-[894px] animate-fade-in px-4 py-6 md:px-8 md:py-16">
      <Suspense>
        <ResourcesFront />
      </Suspense>
    </div>
  );
}

function ResourcesFront() {
  const { t } = useTranslation();
  const [howOpen, setHowOpen] = useState(false);
  const { filters, query, setQuery, toggle, clearFilters } = useResourceFilters();
  const categories = getCategoriesWithPartners();
  const partners = useResourcePartners();

  const searching = query.trim().length > 0 || hasActiveFilters(filters);
  const { results, unlistedCount } = useMemo(() => {
    const matched = selectPartnersMatching(partners, query, (c) =>
      t(PARTNER_CATEGORY_LABEL_KEYS[c]),
    );
    return applyFilters(matched, filters);
  }, [partners, query, filters, t]);

  return (
    <div className="flex flex-col gap-9">
      <header className="flex flex-col gap-[3px]">
        <h1 className="text-[28px] leading-tight font-bold tracking-[-0.3px] text-res-heading md:text-[32px]">
          {t("resources.heading")}
        </h1>
        <p className="text-sm leading-[18.9px] text-res-secondary">
          {t("resources.intro")}
        </p>
        <button
          type="button"
          onClick={() => setHowOpen(true)}
          className="self-start text-start text-sm leading-[18.9px] text-res-link underline underline-offset-2 hover:no-underline"
        >
          {t("resources.howWeChoose.link")}
        </button>
      </header>

      <div className="flex flex-col gap-2">
        <ResourcesSearch value={query} onCommit={setQuery} />
        <div className="flex flex-wrap items-center gap-2.5 py-2.5">
          <span className="text-sm leading-[18.9px] font-medium text-res-count">
            {t("resources.tryPreferences")}
          </span>
          {PREFERENCE_PILLS.map(({ group, value }) => (
            <FilterPill
              key={`${group}:${value}`}
              label={filterValueLabel(t, group, value)}
              selected={(filters[group] as string[]).includes(value)}
              onClick={() => toggle(group, value)}
            />
          ))}
        </div>
      </div>

      {searching ? (
        <section className="flex flex-col gap-4">
          <h2 className="text-base font-semibold text-res-heading" aria-live="polite">
            {t("resources.resultCount", { count: results.length })}
          </h2>
          <PartnerResults
            scope={partners}
            directory={partners}
            results={results}
            unlistedCount={unlistedCount}
            filters={filters}
            onToggle={toggle}
            onClear={clearFilters}
            showCategory
          />
        </section>
      ) : categories.length === 0 ? (
        <div className="rounded-2xl bg-res-search px-6 py-12 text-center">
          <p className="text-sm font-semibold text-res-card-text">
            {t("resources.emptyTitle")}
          </p>
          <p className="mt-1 text-sm text-res-secondary">
            {t("resources.emptyText")}
          </p>
        </div>
      ) : (
        <section className="flex flex-col gap-2.5">
          <h2 className="text-base leading-[18.9px] font-semibold text-res-heading">
            {t("resources.browseByGoal")}
          </h2>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-[repeat(4,200px)]">
            {categories.map(({ category, partnerCount }) => (
              <CategoryTile
                key={category}
                category={category}
                partnerCount={partnerCount}
              />
            ))}
          </div>
        </section>
      )}

      <HowWeChooseSheet open={howOpen} onClose={() => setHowOpen(false)} />
    </div>
  );
}
