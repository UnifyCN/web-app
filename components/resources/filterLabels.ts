import type { TFunction } from "i18next";
import { COST_LABEL_KEYS } from "@/lib/resources/categories";
import type { FilterGroup } from "@/lib/resources/filters";
import type { Cost } from "@/types";

/** Display label for one filter value. Language names come from the partner copy. */
export function filterValueLabel(
  t: TFunction,
  group: FilterGroup,
  value: string,
  languageNames?: Map<string, string>,
): string {
  switch (group) {
    case "format":
      return t(`resources.format.${value}`);
    case "loc":
      return t(`resources.location.${value}`);
    case "elig":
      return t(`resources.eligibilityTag.${value}`);
    case "cost":
      return t(COST_LABEL_KEYS[value as Cost]);
    case "lang":
      return languageNames?.get(value) ?? value;
  }
}
