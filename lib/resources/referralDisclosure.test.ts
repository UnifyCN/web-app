import { describe, expect, it } from "vitest";
import { getActivePartners } from "./partners";
import { hasReferralDisclosure } from "./referralDisclosure";

describe("hasReferralDisclosure", () => {
  it("discloses Canada Shaws", () => {
    expect(hasReferralDisclosure({ slug: "canada-shaw-immigration" })).toBe(true);
  });

  it("discloses only partners with a signed referral agreement", () => {
    expect(
      getActivePartners()
        .filter(hasReferralDisclosure)
        .map((p) => p.slug),
    ).toEqual(["canada-shaw-immigration"]);
  });

  it("never discloses a partner that is not typed as a referral", () => {
    for (const p of getActivePartners().filter(hasReferralDisclosure)) {
      expect(p.partnershipType, p.slug).toBe("referral");
    }
  });
});
