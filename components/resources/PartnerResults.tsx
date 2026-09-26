"use client";

import { useTranslation } from "react-i18next";
import { Info } from "lucide-react";
import type { ResourcePartner } from "@/lib/resources/partners";
import type { FilterGroup, ResourceFilters } from "@/lib/resources/filters";
import { FiltersPanel } from "./FiltersPanel";
import { PartnerCard } from "./PartnerCard";

/**
 * Filters panel + organization list (Figma 8681:643 body). Used by the category
 * page and by the front page once a search or filter is active.
 */
export function PartnerResults({
  scope,
  directory,
  results,
  unlistedCount,
  filters,
  onToggle,
  onClear,
  showCategory = false,
}: {
  /** Partners the filter options are drawn from (before filtering). */
  scope: ResourcePartner[];
  /** The whole directory — keeps location pills stable across categories. */
  directory: ResourcePartner[];
  results: ResourcePartner[];
  unlistedCount: number;
  filters: ResourceFilters;
  onToggle: (group: FilterGroup, value: string) => void;
  onClear: () => void;
  showCategory?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-6 md:flex-row md:items-start">
      <FiltersPanel
        partners={scope}
        directory={directory}
        filters={filters}
        onToggle={onToggle}
        onClear={onClear}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {unlistedCount > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-res-count">
            <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {t("resources.filters.unlisted", { count: unlistedCount })}
          </p>
        )}
        {results.length === 0 ? (
          <div className="rounded-2xl bg-res-search px-6 py-12 text-center">
            <p className="text-sm font-semibold text-res-card-text">
              {t("resources.noResultsTitle")}
            </p>
            <p className="mt-1 text-sm text-res-secondary">
              {t("resources.noResultsText")}
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-4">
            {results.map((p) => (
              <li key={p.slug}>
                <PartnerCard partner={p} showCategory={showCategory} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
