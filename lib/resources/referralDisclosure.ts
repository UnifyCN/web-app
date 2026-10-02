import type { Partner } from "@/types";

/**
 * Partners Unify earns a referral fee from under a signed agreement. Their
 * listings carry the `resources.referralDisclosure` line wherever they appear.
 *
 * Keyed by slug rather than `partnershipType === "referral"`: that type also
 * marks TuGo, Desjardins and Global Connect, whose agreements are not
 * confirmed, and a disclosure on those would state a fee we may not earn. Add
 * a slug here once its agreement is signed.
 */
const REFERRAL_FEE_SLUGS: ReadonlySet<string> = new Set(["canada-shaw-immigration"]);

export function hasReferralDisclosure(partner: Pick<Partner, "slug">): boolean {
  return REFERRAL_FEE_SLUGS.has(partner.slug);
}
