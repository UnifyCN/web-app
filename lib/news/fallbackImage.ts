/**
 * Client-side fallback images for news thumbnails whose `image_link` fails to
 * load (publisher hosts 404 / hotlink-block). One representative photo per
 * category, taken from the `news-crawler` `FALLBACK_POOLS`
 * (supabase/functions/news-crawler/index.ts) — every id is already verified
 * 200 image/jpeg; do not add unverified URLs. `images.unsplash.com` is
 * allowlisted in next.config.ts.
 */
const IMG = (id: string) =>
  `https://images.unsplash.com/${id}?w=800&q=80&auto=format&fit=crop`;

export const FALLBACK_BY_CATEGORY: Record<string, string> = {
  Immigration: IMG("photo-1523580846011-d3a5bc25702b"),
  Benefits: IMG("photo-1521791136064-7986c2920216"),
  Health: IMG("photo-1576091160550-2173dba999ef"),
  Finance: IMG("photo-1554224155-6726b3ff858f"),
  Housing: IMG("photo-1560518883-ce09059eeffa"),
  Community: IMG("photo-1517456793572-1d8efd6dc135"),
};

/** Neutral default for an unknown / null category (matches the crawler's DEFAULT_POOL). */
export const DEFAULT_FALLBACK = FALLBACK_BY_CATEGORY.Community;

/** Category → a verified fallback image URL, defaulting when unknown/null. */
export function newsFallbackSrc(category: string | null | undefined): string {
  return (category && FALLBACK_BY_CATEGORY[category]) || DEFAULT_FALLBACK;
}
