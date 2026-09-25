import { describe, expect, it } from "vitest";
import { getActiveResourcePartners, withFacets, PARTNERS } from "./partners";
import {
  EMPTY_FILTERS,
  applyFilters,
  filtersToParams,
  languageOptions,
  locationOptions,
  parseFilters,
  toggleFilter,
  type ResourceFilters,
} from "./filters";

const all = getActiveResourcePartners();
const run = (f: Partial<ResourceFilters>) =>
  applyFilters(all, { ...EMPTY_FILTERS, ...f });
const slugs = (f: Partial<ResourceFilters>) => run(f).results.map((p) => p.slug);
const bySlug = (slug: string) => withFacets(PARTNERS.find((p) => p.slug === slug)!);

describe("applyFilters", () => {
  it("is a no-op with no active filters", () => {
    expect(run({})).toEqual({ results: all, unlistedCount: 0 });
  });

  it("excludes and counts partners that don't list the filtered value", () => {
    const { results, unlistedCount } = run({ format: ["online"] });
    expect(results.every((p) => p.format !== "unknown")).toBe(true);
    expect(unlistedCount).toBe(all.filter((p) => p.format === "unknown").length);
  });

  it("matches 'both' for online, in person and hybrid", () => {
    for (const format of ["online", "in_person", "hybrid"] as const) {
      expect(slugs({ format: [format] })).toContain("sfu-international");
    }
    expect(slugs({ format: ["hybrid"] })).not.toContain("tugo");
  });

  it("lets BC-wide and national partners match any city", () => {
    const surrey = slugs({ loc: ["surrey"] });
    expect(surrey).toContain("surrey-libraries");
    expect(surrey).toContain("ymca-bc"); // British Columbia
    expect(surrey).toContain("tugo"); // Canada and worldwide
    expect(surrey).toContain("diversecity"); // Greater Vancouver
    expect(surrey).not.toContain("burnaby-public-library");
    expect(surrey).not.toContain("desjardins"); // Quebec and Ontario
  });

  it("'Across BC' matches only province-wide and national partners", () => {
    const bc = slugs({ loc: ["bc_wide"] });
    expect(bc).toContain("amssa");
    expect(bc).toContain("big-brothers-big-sisters");
    expect(bc).not.toContain("surrey-libraries");
    expect(bc).not.toContain("diversecity");
  });

  it("treats 'open to everyone' as matching every status", () => {
    expect(slugs({ elig: ["refugees"] })).toContain("vancouver-public-library");
    expect(slugs({ elig: ["everyone"] })).not.toContain("diversecity");
  });

  it("ORs within a group and ANDs across groups", () => {
    const either = slugs({ cost: ["free", "paid"] });
    expect(either).toContain("iec-bc");
    expect(either).toContain("global-connect-immigration");
    expect(slugs({ cost: ["free"], loc: ["surrey"] })).toEqual(
      expect.arrayContaining(["surrey-libraries", "iec-bc"]),
    );
    expect(slugs({ cost: ["free"], loc: ["surrey"] })).not.toContain(
      "global-connect-immigration",
    );
  });

  it("merges language aliases", () => {
    expect(slugs({ lang: ["Farsi"] })).toEqual(
      expect.arrayContaining(["canada-shaw-immigration", "surrey-libraries"]),
    );
  });
});

describe("options", () => {
  it("offers a city when a scoped partner serves it via a wider area", () => {
    const settled = all.filter((p) => p.category === "gettingSettled");
    expect(locationOptions(settled, all)).toEqual([
      "vancouver",
      "surrey",
      "burnaby",
      "richmond",
      "delta",
      "bc_wide",
    ]);
    const libraries = all.filter((p) => p.category === "librariesLearning");
    expect(locationOptions(libraries, all)).toEqual([
      "vancouver",
      "surrey",
      "burnaby",
    ]);
  });

  it("lists only cities a partner names, then Across BC", () => {
    expect(locationOptions(all)).toEqual([
      "vancouver",
      "surrey",
      "burnaby",
      "richmond",
      "delta",
      "bc_wide",
    ]);
  });

  it("orders languages by how many partners list them", () => {
    const langs = languageOptions(all);
    expect(langs.slice(0, 2)).toEqual(["English", "French"]);
    expect(langs).not.toContain("Persian (Farsi)");
  });

  it("derives Canada Shaws tags without touching its record", () => {
    expect(bySlug("canada-shaw-immigration").eligibilityTags).toEqual(["everyone"]);
  });
});

describe("URL round-trip", () => {
  it("parses, validates and re-serialises", () => {
    const f = parseFilters(
      new URLSearchParams("format=online,bogus&loc=surrey&cost=free&lang=Arabic"),
    );
    expect(f).toEqual({
      ...EMPTY_FILTERS,
      format: ["online"],
      loc: ["surrey"],
      cost: ["free"],
      lang: ["Arabic"],
    });
    const p = filtersToParams(new URLSearchParams("x=1"), f, "job");
    expect(p.toString()).toBe(
      "x=1&format=online&loc=surrey&lang=Arabic&cost=free&q=job",
    );
  });

  it("toggles values on and off", () => {
    const on = toggleFilter(EMPTY_FILTERS, "cost", "free");
    expect(on.cost).toEqual(["free"]);
    expect(toggleFilter(on, "cost", "free").cost).toEqual([]);
  });
});
