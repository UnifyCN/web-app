import { describe, expect, it } from "vitest";
import canadaShawsOnMain from "./__fixtures__/canada-shaw-immigration.main.json";
import { makeT } from "./__fixtures__/i18n";
import { localizePartner } from "./localizePartner";
import {
  PARTNERS,
  PARTNER_FACETS,
  getActivePartners,
  getMorePartnersNoteProvince,
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
    expect(
      getActivePartners("British Columbia").some(
        (p) => p.slug === "global-connect-immigration",
      ),
    ).toBe(false);
  });

  describe("province targeting (mobile #347)", () => {
    const slugsFor = (province: string | null) =>
      getActivePartners(province).map((p) => p.slug);

    it("shows BC partners and national ones to a BC reader", () => {
      const bc = slugsFor("British Columbia");
      expect(bc).toContain("diversecity");
      expect(bc).toContain("tugo");
      expect(bc).not.toContain("desjardins");
    });

    it("reads stored codes like BC and ON", () => {
      expect(slugsFor("BC")).toEqual(slugsFor("British Columbia"));
      expect(slugsFor("ON")).toEqual(slugsFor("Ontario"));
    });

    it("shows only national and own-province partners elsewhere", () => {
      expect(slugsFor("Ontario").sort()).toEqual(
        ["canada-shaw-immigration", "desjardins", "newcomer-jobs-canada", "tugo"].sort(),
      );
    });

    it("shows only national partners to a reader with no province", () => {
      expect(slugsFor(null).sort()).toEqual(
        ["canada-shaw-immigration", "newcomer-jobs-canada", "tugo"].sort(),
      );
    });

    it("tags every partner the way mobile does", () => {
      const tagged = Object.fromEntries(
        PARTNERS.map((p) => [p.slug, p.provinces ?? null]),
      );
      expect(tagged["desjardins"]).toEqual(["Ontario", "Quebec"]);
      expect(tagged["tugo"]).toBeNull();
      expect(tagged["newcomer-jobs-canada"]).toBeNull();
      expect(tagged["canada-shaw-immigration"]).toBeNull();
      const bcOnly = PARTNERS.filter(
        (p) => p.provinces?.length === 1 && p.provinces[0] === "British Columbia",
      );
      expect(bcOnly).toHaveLength(16);
    });

    it("names the province in the coming-soon note outside BC only", () => {
      expect(getMorePartnersNoteProvince("ON")).toBe("Ontario");
      expect(getMorePartnersNoteProvince("British Columbia")).toBeNull();
      expect(getMorePartnersNoteProvince(null)).toBeNull();
      expect(getMorePartnersNoteProvince("Somewhere")).toBeNull();
    });
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
