import { describe, expect, it } from "vitest";
import { EVENT_PARTNERS, isKnownPartnerSlug, partnerLabel } from "./eventPartners";

describe("EVENT_PARTNERS", () => {
  it("has the 18 landing-page partners, each slug once", () => {
    expect(EVENT_PARTNERS).toHaveLength(18);
    expect(new Set(EVENT_PARTNERS.map((p) => p.slug)).size).toBe(18);
  });

  it("includes canada-shaws-consulting (missing from stale landing-page checkouts)", () => {
    expect(partnerLabel("canada-shaws-consulting")).toBe(
      "Canada Shaws Consulting Inc.",
    );
  });

  it("covers every slug the events-crawler backfill stamps", () => {
    // supabase/migrations/20260925120000_events_featured_partner.sql
    for (const slug of [
      "sfu",
      "capilano-university",
      "burnaby-neighbourhood-house",
      "vancouver-public-library",
      "surrey-libraries",
    ]) {
      expect(isKnownPartnerSlug(slug)).toBe(true);
    }
  });

  it("uses landing-page slug syntax (lowercase, hyphenated)", () => {
    for (const { slug } of EVENT_PARTNERS) {
      expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });
});

describe("partnerLabel", () => {
  it("maps a known slug to its name", () => {
    expect(partnerLabel("rbc")).toBe("RBC - Royal Bank of Canada");
    expect(partnerLabel("sfu")).toBe("Simon Fraser University");
  });

  it("returns null when there is no partner", () => {
    expect(partnerLabel(null)).toBeNull();
    expect(partnerLabel(undefined)).toBeNull();
    expect(partnerLabel("")).toBeNull();
    expect(partnerLabel("   ")).toBeNull();
  });

  it("shows an unknown slug as stored instead of hiding it", () => {
    expect(partnerLabel("some-new-partner")).toBe("some-new-partner");
    expect(isKnownPartnerSlug("some-new-partner")).toBe(false);
  });

  it("ignores stray whitespace from hand-entered rows", () => {
    expect(partnerLabel(" ey ")).toBe("EY");
  });
});
