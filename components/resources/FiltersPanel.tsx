"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { COST_ORDER, type ResourcePartner } from "@/lib/resources/partners";
import {
  ELIGIBILITY_OPTIONS,
  FORMAT_OPTIONS,
  activeGroups,
  languageLabels,
  languageOptions,
  locationOptions,
  type FilterGroup,
  type ResourceFilters,
} from "@/lib/resources/filters";
import { FilterPill } from "./FilterPill";
import { filterValueLabel } from "./filterLabels";

/** Languages shown before "Show all". */
const LANGUAGE_PREVIEW = 6;

/** Options a group really has (languages count all, not just the preview). */
const groupSize = (group: FilterGroup, shown: number, allLanguages: number) =>
  group === "lang" ? allLanguages : shown;

/**
 * Filters panel (Figma 8681:643). Options come from the partners in scope, so a
 * category only offers values some of its organizations list. Below `md` it
 * collapses behind a "Filters" toggle so the list stays in view on phones.
 */
export function FiltersPanel({
  partners,
  directory,
  filters,
  onToggle,
  onClear,
}: {
  partners: ResourcePartner[];
  directory: ResourcePartner[];
  filters: ResourceFilters;
  onToggle: (group: FilterGroup, value: string) => void;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [allLanguages, setAllLanguages] = useState(false);
  const activeCount = activeGroups(filters).reduce(
    (n, g) => n + filters[g].length,
    0,
  );

  const languages = languageOptions(partners);
  const languageNames = languageLabels(directory);
  // Keep a selected language visible even when it's past the preview cut.
  const shownLanguages = allLanguages
    ? languages
    : languages.filter(
        (l, i) => i < LANGUAGE_PREVIEW || filters.lang.includes(l),
      );
  const costs = COST_ORDER.filter((c) => partners.some((p) => p.cost === c));

  // Only offer values some partner in scope can match.
  const formats = FORMAT_OPTIONS.filter((o) =>
    partners.some((p) =>
      o === "hybrid" ? p.format === "both" : p.format === o || p.format === "both",
    ),
  );
  const anyoneWelcome = partners.some((p) => p.eligibilityTags.includes("everyone"));
  const eligibility = ELIGIBILITY_OPTIONS.filter(
    (tag) => anyoneWelcome || partners.some((p) => p.eligibilityTags.includes(tag)),
  );

  const groups: { group: FilterGroup; options: string[] }[] = [
    { group: "format", options: formats },
    {
      group: "loc",
      options: locationOptions(partners, directory),
    },
    { group: "elig", options: eligibility },
    { group: "lang", options: shownLanguages },
    { group: "cost", options: costs },
  ];

  return (
    <div className="w-full shrink-0 md:w-[284px]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="resources-filters"
        className="inline-flex items-center gap-2 rounded-full border border-res-outline bg-surface px-3.5 py-2 text-sm font-semibold text-res-card-text md:hidden"
      >
        <SlidersHorizontal className="h-4 w-4" aria-hidden />
        {t("resources.filters.toggle")}
        {activeCount > 0 && (
          <span className="rounded-full bg-res-link px-1.5 text-[11px] leading-5 text-white">
            {activeCount}
          </span>
        )}
      </button>

      <section
        id="resources-filters"
        aria-label={t("resources.filters.title")}
        className={cn(
          "mt-3 flex-col gap-4 rounded-[15px] border border-res-border bg-surface p-2.5 md:mt-0 md:flex",
          open ? "flex" : "hidden",
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[14.5px] font-bold text-res-card-text">
            {t("resources.filters.title")}
          </h2>
          {activeCount > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="text-xs font-semibold text-res-link hover:underline"
            >
              {t("resources.filters.clear")}
            </button>
          )}
        </div>

        {groups.map(({ group, options }) =>
          // A single option can't narrow anything — hide the group, unless a
          // value is selected (so an active filter can always be cleared).
          groupSize(group, options.length, languages.length) < 2 &&
          filters[group].length === 0 ? null : (
            <div key={group} className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold text-res-count uppercase">
                {t(`resources.filters.group.${group}`)}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {options.map((value) => (
                  <FilterPill
                    key={value}
                    label={filterValueLabel(t, group, value, languageNames)}
                    selected={(filters[group] as string[]).includes(value)}
                    onClick={() => onToggle(group, value)}
                  />
                ))}
                {group === "lang" && languages.length > LANGUAGE_PREVIEW && (
                  <button
                    type="button"
                    onClick={() => setAllLanguages((a) => !a)}
                    className="px-1 text-[11.5px] font-bold text-res-link hover:underline"
                  >
                    {allLanguages
                      ? t("resources.filters.showFewer")
                      : t("resources.filters.showAll")}
                  </button>
                )}
              </div>
            </div>
          ),
        )}
      </section>
    </div>
  );
}
