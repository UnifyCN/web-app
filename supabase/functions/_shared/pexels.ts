// @ts-nocheck Deno runtime — Supabase Edge Functions
/**
 * Pexels image search, used by the crawlers as a middle image tier: a real stock photo
 * when the source has none, tried before the deterministic Unsplash fallback pool.
 *
 * Degrades gracefully by design. If PEXELS_API_KEY is unset, or the API errors / times
 * out / returns nothing, this returns [] and the caller falls through to its existing
 * fallback — so it is safe to ship before the secret exists.
 *
 * Returns the whole candidate LIST (not one URL) so the caller can memoise it per query
 * within a run — one API call per topic — and still pick a per-event photo from it, keeping
 * covers varied across same-topic events and stable across re-crawls. Free tier is
 * 200 req/hr, 20k/month; per-query memoisation keeps a run to a handful of calls.
 */

import { isPublicHttpUrl } from './ssrf.ts';

const PEXELS_ENDPOINT = 'https://api.pexels.com/v1/search';
const PEXELS_IMAGE_HOST = 'images.pexels.com';
const PEXELS_TIMEOUT_MS = 6000;

/**
 * Search Pexels for landscape photos matching `query`. Returns up to 10 validated image
 * URLs (public + on the Pexels CDN), or [] on missing key / error / no results — never
 * throws.
 */
export async function fetchPexelsCandidates(query: string): Promise<string[]> {
  const key = Deno.env.get('PEXELS_API_KEY');
  if (!key) return []; // no secret ⇒ inert; caller uses its own fallback

  const url =
    `${PEXELS_ENDPOINT}?query=${encodeURIComponent(query)}` +
    `&orientation=landscape&size=large&per_page=10`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PEXELS_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Authorization: key, Accept: 'application/json' },
    });
    if (!res.ok) {
      console.error(`pexels: HTTP ${res.status} for "${query}"`);
      return [];
    }
    const data = await res.json();
    const photos = Array.isArray(data?.photos) ? data.photos : [];

    const urls: string[] = [];
    for (const photo of photos) {
      const src = photo?.src;
      if (!src || typeof src !== 'object') continue;
      // Prefer the 1200×627 landscape crop (matches the card's 16/9); fall back for shape.
      const candidate: unknown = src.landscape ?? src.large2x ?? src.large ?? src.original;
      if (typeof candidate !== 'string') continue;
      // Trust the API but still validate: public URL AND the expected Pexels CDN host.
      if (!isPublicHttpUrl(candidate)) continue;
      try {
        if (new URL(candidate).hostname.toLowerCase() !== PEXELS_IMAGE_HOST) continue;
      } catch {
        continue;
      }
      urls.push(candidate);
    }
    return urls;
  } catch (error) {
    console.error(`pexels: fetch failed for "${query}":`, error);
    return [];
  } finally {
    clearTimeout(timer);
  }
}
