import type { Cost } from "@/types";
import {
  COST_ORDER,
  type EligibilityTag,
  type LocationKey,
  type ResourcePartner,
} from "./partners";

/*
 * Resources filters (Figma 8681:643 "Filters" panel + 8681:503 preference
 * pills). Pure functions over ResourcePartner so they're unit-testable; the
 * state round-trips through URL search params so filtered views are shareable
 * and the back button works.
 *
 * Semantics: OR within a group, AND across groups (and AND with search). A
 * partner whose data doesn't state a group's value is EXCLUDED while that group
 * is active — never guessed in.
 */

export type FormatOption = "in_person" | "online" | "hybrid";
export type CityKey = Extract<
  LocationKey,
  "vancouver" | "surrey" | "burnaby" | "richmond" | "delta"
>;
/** A city, or "bc_wide" = the "Across BC" pill. */
export type LocationOption = CityKey | "bc_wide";

export interface ResourceFilters {
  format: FormatOption[];
  loc: LocationOption[];
  elig: EligibilityTag[];
  lang: string[];
  cost: Cost[];
}

export type FilterGroup = keyof ResourceFilters;

export const FILTER_GROUPS: FilterGroup[] = [
  "format",
  "loc",
  "elig",
  "lang",
  "cost",
];

export const EMPTY_FILTERS: ResourceFilters = {
  format: [],
  loc: [],
  elig: [],
  lang: [],
  cost: [],
};

export const FORMAT_OPTIONS: FormatOption[] = ["online", "in_person", "hybrid"];
/** Display order for city pills (only cities some partner names are shown). */
export const CITY_ORDER: CityKey[] = [
  "vancouver",
  "surrey",
  "burnaby",
  "richmond",
  "delta",
];
export const ELIGIBILITY_OPTIONS: EligibilityTag[] = [
  "permanent_residents",
  "permits",
  "refugees",
  "everyone",
];

/** Every city key is a Metro Vancouver municipality. */
const WIDE_SCOPES: LocationKey[] = ["metro_vancouver", "bc_wide", "national"];

/** Same language under two spellings in the partner copy → one filter value. */
const LANGUAGE_ALIASES: Record<string, string> = {
  "Persian (Farsi)": "Farsi",
  "Filipino (Tagalog)": "Tagalog",
};

export const canonicalLanguage = (name: string): string =>
  LANGUAGE_ALIASES[name] ?? name;

const partnerLanguages = (p: ResourcePartner): string[] =>
  (p.languages ?? []).map(canonicalLanguage);

/** True when the partner's data doesn't state this group's value. */
export function isUnknownFor(p: ResourcePartner, group: FilterGroup): boolean {
  switch (group) {
    case "format":
      return p.format === "unknown";
    case "loc":
      return p.locations.length === 0;
    case "elig":
      return p.eligibilityTags.length === 0;
    case "lang":
      return partnerLanguages(p).length === 0;
    case "cost":
      return p.cost === undefined;
  }
}

function matchesFormat(p: ResourcePartner, option: FormatOption): boolean {
  if (option === "hybrid") return p.format === "both";
  return p.format === option || p.format === "both";
}

function matchesLocation(p: ResourcePartner, option: LocationOption): boolean {
  if (option === "bc_wide") {
    return p.locations.includes("bc_wide") || p.locations.includes("national");
  }
  return p.locations.some((l) => l === option || WIDE_SCOPES.includes(l));
}

function matchesEligibility(p: ResourcePartner, tag: EligibilityTag): boolean {
  // "Open to everyone" covers every status group.
  return p.eligibilityTags.includes(tag) || p.eligibilityTags.includes("everyone");
}

function matchesGroup(p: ResourcePartner, group: FilterGroup, f: ResourceFilters) {
  switch (group) {
    case "format":
      return f.format.some((o) => matchesFormat(p, o));
    case "loc":
      return f.loc.some((o) => matchesLocation(p, o));
    case "elig":
      return f.elig.some((t) => matchesEligibility(p, t));
    case "lang": {
      const langs = partnerLanguages(p);
      return f.lang.some((l) => langs.includes(l));
    }
    case "cost":
      return p.cost !== undefined && f.cost.includes(p.cost);
  }
}

export const activeGroups = (f: ResourceFilters): FilterGroup[] =>
  FILTER_GROUPS.filter((g) => f[g].length > 0);

export const hasActiveFilters = (f: ResourceFilters): boolean =>
  activeGroups(f).length > 0;

export interface FilterResult {
  results: ResourcePartner[];
  /** Partners dropped because their data doesn't list an active group's value. */
  unlistedCount: number;
}

export function applyFilters(
  partners: ResourcePartner[],
  f: ResourceFilters,
): FilterResult {
  const groups = activeGroups(f);
  if (groups.length === 0) return { results: partners, unlistedCount: 0 };
  let unlistedCount = 0;
  const results = partners.filter((p) => {
    if (groups.some((g) => isUnknownFor(p, g))) {
      unlistedCount += 1;
      return false;
    }
    return groups.every((g) => matchesGroup(p, g, f));
  });
  return { results, unlistedCount };
}

/**
 * Location pills for a scope: cities some partner in the whole directory names
 * (so the list stays stable), kept only when a partner in scope serves them —
 * including via a wider area — plus "Across BC" when one qualifies.
 */
export function locationOptions(
  scope: ResourcePartner[],
  directory: ResourcePartner[] = scope,
): LocationOption[] {
  const named = new Set(directory.flatMap((p) => p.locations));
  const options: LocationOption[] = [
    ...CITY_ORDER.filter((c) => named.has(c)),
    "bc_wide",
  ];
  return options.filter((o) => scope.some((p) => matchesLocation(p, o)));
}

/** Every language a partner lists, most-listed first, then A–Z. */
export function languageOptions(partners: ResourcePartner[]): string[] {
  const counts = new Map<string, number>();
  for (const p of partners) {
    for (const l of new Set(partnerLanguages(p))) {
      counts.set(l, (counts.get(l) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([l]) => l);
}

// ── URL round-trip ───────────────────────────────────────────────────────────

const ALLOWED: { [G in Exclude<FilterGroup, "lang">]: readonly string[] } = {
  format: FORMAT_OPTIONS,
  loc: [...CITY_ORDER, "bc_wide"],
  elig: ELIGIBILITY_OPTIONS,
  cost: COST_ORDER,
};

/** Reads filters from search params, dropping unknown values. */
export function parseFilters(params: URLSearchParams): ResourceFilters {
  const read = (key: FilterGroup): string[] => {
    const raw = params.get(key);
    if (!raw) return [];
    const values = [...new Set(raw.split(",").map((v) => v.trim()).filter(Boolean))];
    return key === "lang"
      ? values
      : values.filter((v) => ALLOWED[key].includes(v));
  };
  return {
    format: read("format") as FormatOption[],
    loc: read("loc") as LocationOption[],
    elig: read("elig") as EligibilityTag[],
    lang: read("lang"),
    cost: read("cost") as Cost[],
  };
}

/** Writes filters (+ an optional query) into a copy of the given params. */
export function filtersToParams(
  base: URLSearchParams,
  f: ResourceFilters,
  q?: string,
): URLSearchParams {
  const next = new URLSearchParams(base);
  for (const g of FILTER_GROUPS) {
    if (f[g].length > 0) next.set(g, f[g].join(","));
    else next.delete(g);
  }
  if (q !== undefined) {
    if (q.trim()) next.set("q", q);
    else next.delete("q");
  }
  return next;
}

/** Toggles one value in a group, returning new filters. */
export function toggleFilter(
  f: ResourceFilters,
  group: FilterGroup,
  value: string,
): ResourceFilters {
  const current = f[group] as string[];
  const next = current.includes(value)
    ? current.filter((v) => v !== value)
    : [...current, value];
  return { ...f, [group]: next };
}

/** Front-page preference pills (Figma 8681:503), each preset to one filter. */
export const PREFERENCE_PILLS: {
  group: "format" | "loc";
  value: FormatOption | LocationOption;
}[] = [
  { group: "format", value: "in_person" },
  { group: "format", value: "online" },
  { group: "loc", value: "surrey" },
  { group: "loc", value: "burnaby" },
  { group: "loc", value: "vancouver" },
];
