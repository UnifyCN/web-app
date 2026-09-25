import { describe, expect, it } from "vitest";
import canadaShawsOnMain from "./__fixtures__/canada-shaw-immigration.main.json";
import { makeT } from "./__fixtures__/i18n";
import { localizePartner } from "./localizePartner";
import {
  PARTNERS,
  PARTNER_FACETS,
  getActivePartners,
  getPartnerBySlug,
} from "./partners";

describe("partner data", () => {
  it("gives every partner a facet entry", () => {
    for (const p of PARTNERS) {
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

  it("follows mobile in holding Global Connect inactive", () => {
    expect(getActivePartners().some((p) => p.slug === "global-connect-immigration")).toBe(
      false,
    );
  });

  // Canada Shaws copy is under contract and changes only at their request. The
  // record moved to structure + locale copy; resolved in English it must still
  // match main's record field for field (heroImage is no longer rendered).
  it("resolves Canada Shaws in English exactly as on main", () => {
    const partner = getPartnerBySlug("canada-shaw-immigration")!;
    const resolved = localizePartner(partner, makeT("en")) as unknown as Record<
      string,
      unknown
    >;
    const { programs: mainPrograms, heroImage, ...mainFields } =
      canadaShawsOnMain as Record<string, unknown> & {
        programs: { name: string; description: string }[];
      };
    void heroImage;
    for (const [field, value] of Object.entries(mainFields)) {
      expect(resolved[field], field).toEqual(value);
    }
    expect(
      (resolved.programs as { name: string; description: string }[]).map(
        ({ name, description }) => ({ name, description }),
      ),
    ).toEqual(mainPrograms);
  });
});
