/**
 * The Unify partners an event can be linked to through `events.partner_slug`.
 *
 * SOURCE OF TRUTH: `src/lib/partners.ts` in the UnifyCN/Unify-Landing-Page repo, on
 * `origin/main`. The landing page renders `/partners/<slug>` and lists an event under
 * a partner by this slug, so a slug here that the landing page does not know links to
 * nothing. When a partner is added or renamed there, copy the change here.
 *
 * Copied 2026-09-26 (18 partners). A stale local checkout of the landing page has 17
 * and lacks `canada-shaws-consulting` — copy from `origin/main`, not the checkout.
 */

export interface EventPartner {
  slug: string;
  name: string;
}

export const EVENT_PARTNERS: readonly EventPartner[] = [
  { slug: "rbc", name: "RBC - Royal Bank of Canada" },
  { slug: "ey", name: "EY" },
  { slug: "global-connect-immigration", name: "Global Connect Immigration" },
  { slug: "canada-shaws-consulting", name: "Canada Shaws Consulting Inc." },
  { slug: "ymca-bc", name: "YMCA BC" },
  { slug: "sfu", name: "Simon Fraser University" },
  { slug: "fraser-international-college", name: "Fraser International College" },
  { slug: "capilano-university", name: "Capilano University" },
  { slug: "united-way-bc", name: "United Way BC" },
  { slug: "burnaby-neighbourhood-house", name: "Burnaby Neighbourhood House" },
  { slug: "vancouver-public-library", name: "Vancouver Public Library" },
  { slug: "surrey-libraries", name: "Surrey Libraries" },
  { slug: "burnaby-public-library", name: "Burnaby Public Library" },
  { slug: "trout-lake-community-centre", name: "Trout Lake Community Centre" },
  { slug: "newcomer-jobs-canada", name: "Newcomer Jobs Canada" },
  { slug: "promise-vancouver", name: "Promise Vancouver" },
  { slug: "big-brothers-big-sisters", name: "Big Brothers Big Sisters" },
  { slug: "enactus", name: "Enactus" },
];

const NAME_BY_SLUG = new Map(EVENT_PARTNERS.map((p) => [p.slug, p.name]));

/**
 * Display name for a stored `partner_slug`. Null when the row has no partner. A slug
 * that is not in the list (set by hand in the Table Editor, or a partner the landing
 * page has since removed) comes back as the raw slug, so the row still says something
 * true instead of pretending to have no partner.
 */
export function partnerLabel(slug: string | null | undefined): string | null {
  const trimmed = slug?.trim();
  if (!trimmed) return null;
  return NAME_BY_SLUG.get(trimmed) ?? trimmed;
}

/** True when the slug is one of the landing page's partners. */
export function isKnownPartnerSlug(slug: string | null | undefined): boolean {
  return slug != null && NAME_BY_SLUG.has(slug.trim());
}
