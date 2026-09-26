import type { PartnerCategory } from "@/types";
import type { ResourcePartner } from "./partners";

/*
 * Free-text search over the Resources directory. Ported from mobile
 * utils/searchPartners.ts; the web haystack also covers descriptions, program
 * descriptions and languages, since the web cards surface those.
 */

/**
 * Arabic marks that carry no distinction a search should honour: the short-vowel
 * harakat, the madda and the hamza forms NFD splits off their base letter
 * (ٓ-ٕ), the dagger alef, and the tatweel.
 */
const ARABIC_MARKS = /[ً-ٰٕـ]/g;

/**
 * Lowercase and strip combining accents so "Québec" matches "quebec". đ is
 * folded separately (it isn't d + a combining mark). Arabic is folded the way
 * Arabic search conventionally is: marks dropped, alef wasla → alef, alef
 * maqsura → ya, ta marbuta → ha.
 */
export function normalizeQuery(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(ARABIC_MARKS, "")
    .replace(/ٱ/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .trim();
}

/** Resolves a category to its display label, so i18n stays out of this module. */
export type CategoryLabelResolver = (category: PartnerCategory) => string;

function haystack(
  partner: ResourcePartner,
  labelFor: CategoryLabelResolver,
): string {
  return normalizeQuery(
    [
      partner.name,
      partner.tagline,
      partner.description,
      partner.serviceArea,
      labelFor(partner.category),
      ...partner.highlights,
      ...(partner.languages ?? []),
      ...(partner.programs ?? []).flatMap((p) => [p.name, p.description]),
    ].join(" "),
  );
}

/**
 * Partners matching a free-text query, in the order given. Every
 * whitespace-separated token must appear, so "surrey job" narrows. A blank
 * query returns the list unchanged.
 */
export function selectPartnersMatching(
  partners: ResourcePartner[],
  query: string,
  labelFor: CategoryLabelResolver,
): ResourcePartner[] {
  const tokens = normalizeQuery(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return partners;
  return partners.filter((partner) => {
    const text = haystack(partner, labelFor);
    return tokens.every((token) => text.includes(token));
  });
}
