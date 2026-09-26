"use client";

import { Suspense, use, useEffect, useMemo } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { BackLink } from "@/components/resources/BackLink";
import { PartnerResults } from "@/components/resources/PartnerResults";
import { ResourcesSearch } from "@/components/resources/ResourcesSearch";
import { useResourceFilters } from "@/hooks/useResourceFilters";
import {
  CATEGORY_ORDER,
  PARTNER_CATEGORY_LABEL_KEYS,
} from "@/lib/resources/categories";
import { useResourcePartners } from "@/hooks/useResourcePartners";
import { applyFilters } from "@/lib/resources/filters";
import { selectPartnersMatching } from "@/lib/resources/search";
import { trackResourcesCategoryOpened } from "@/lib/analytics";
import type { PartnerCategory } from "@/types";

const isCategory = (key: string): key is PartnerCategory =>
  (CATEGORY_ORDER as string[]).includes(key);

/** Resources category page (Figma 8681:643): search, filters, org list. */
export default function ResourcesCategoryPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { t } = useTranslation();
  const { key } = use(params);
  const category = isCategory(key) ? key : null;

  useEffect(() => {
    if (category) trackResourcesCategoryOpened({ category });
  }, [category]);

  if (!category) {
    return (
      <div className="mx-auto max-w-[680px] px-6 py-16 text-center">
        <p className="text-sm text-ink-muted">{t("resources.notFound")}</p>
        <Link
          href="/resources"
          className="mt-3 inline-block text-sm font-semibold text-primary"
        >
          {t("resources.backToCategories")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[945px] animate-fade-in px-4 py-6 md:px-8 md:py-16">
      <Suspense>
        <CategoryBody category={category} />
      </Suspense>
    </div>
  );
}

function CategoryBody({ category }: { category: PartnerCategory }) {
  const { t } = useTranslation();
  const { filters, query, setQuery, toggle, clearFilters } = useResourceFilters();
  const directory = useResourcePartners();
  const scope = useMemo(
    () => directory.filter((p) => p.category === category),
    [directory, category],
  );
  const { results, unlistedCount } = useMemo(() => {
    const matched = selectPartnersMatching(scope, query, (c) =>
      t(PARTNER_CATEGORY_LABEL_KEYS[c]),
    );
    return applyFilters(matched, filters);
  }, [scope, query, filters, t]);

  return (
    <div className="flex flex-col gap-9">
      <div className="flex flex-col gap-4">
        <BackLink href="/resources" label={t("resources.navLabel")} />
        <ResourcesSearch value={query} onCommit={setQuery} />
      </div>

      <header className="flex flex-col gap-[3px]">
        <h1 className="text-[28px] leading-tight font-bold tracking-[-0.3px] break-words text-res-heading md:text-[32px]">
          {t(PARTNER_CATEGORY_LABEL_KEYS[category])}
        </h1>
        <p className="text-sm leading-[18.9px] text-res-secondary" aria-live="polite">
          {t("resources.orgCount", { count: results.length })}
        </p>
      </header>

      {scope.length === 0 ? (
        <p className="text-sm text-res-secondary">
          {t("resources.noPartnersInCategory")}
        </p>
      ) : (
        <PartnerResults
          scope={scope}
          directory={directory}
          results={results}
          unlistedCount={unlistedCount}
          filters={filters}
          onToggle={toggle}
          onClear={clearFilters}
        />
      )}
    </div>
  );
}
