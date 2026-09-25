import { describe, expect, it } from "vitest";
import canadaShawsOnMain from "./__fixtures__/canada-shaw-immigration.main.json";
import {
  PARTNERS,
  PARTNER_FACETS,
  getActivePartners,
  getPartnerBySlug,
} from "./partners";

describe("partner data", () => {
  it("gives every active partner a facet entry", () => {
    for (const p of getActivePartners()) {
      expect(PARTNER_FACETS[p.slug], p.slug).toBeDefined();
    }
  });

  it("has no facet entry for a slug that doesn't exist", () => {
    const slugs = new Set(PARTNERS.map((p) => p.slug));
    for (const slug of Object.keys(PARTNER_FACETS)) {
      expect(slugs.has(slug), slug).toBe(true);
    }
  });

  it("never uses a slug the /resources/category route would shadow", () => {
    expect(PARTNERS.some((p) => p.slug === "category")).toBe(false);
  });

  // Canada Shaws copy is under contract and changes only at their request.
  it("keeps the Canada Shaws record byte-identical to main", () => {
    expect(getPartnerBySlug("canada-shaw-immigration")).toEqual(canadaShawsOnMain);
  });
});
