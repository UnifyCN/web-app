// Cover-image resolution, in three tiers:
//   1. the event's own image (resolveImageUrl — icon-filtered, SSRF-guarded, size-checked),
//   2. a Pexels stock photo matching the event's topic — INERT unless PEXELS_API_KEY is set,
//   3. a deterministic Unsplash pool, the always-available last resort.

import { isPublicHttpUrl } from '../../_shared/ssrf.ts';
import { fetchPexelsCandidates } from '../../_shared/pexels.ts';
import { USER_AGENT } from './constants.ts';

// Topic-appropriate Unsplash fallback pool (images.unsplash.com is allowlisted in
// next.config.ts). All ids are reused from the production news-crawler pools (already
// verified 200 image/jpeg) so none 404. Stable photo-<id> form only.
const IMG = (id: string) =>
  `https://images.unsplash.com/${id}?w=800&q=80&auto=format&fit=crop`;

const EVENTS_FALLBACK_POOL: string[] = [
  'photo-1517456793572-1d8efd6dc135',
  'photo-1697490251788-21888514f669',
  'photo-1517457373958-b7bdd4587205',
  'photo-1498661694102-0a3793edbe74',
  'photo-1642307063371-2e3e8909c3cb',
  'photo-1758272133542-b3107b947fc2',
  'photo-1523580846011-d3a5bc25702b',
  'photo-1531206715517-5c0ba140b2b8',
  'photo-1566438503908-4f8377461f58',
  'photo-1517048676732-d65bc937f952',
  'photo-1521791136064-7986c2920216',
  'photo-1573497491208-6b1acb260507',
].map(IMG);

/**
 * Deterministic non-crypto string hash so a given event link always maps to the same
 * pool image (stable across re-crawls) while different links spread across it.
 */
export function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function fallbackImage(link: string): string {
  return EVENTS_FALLBACK_POOL[hashStr(link) % EVENTS_FALLBACK_POOL.length];
}

// Raw event titles ("Tai Chi – 48 Advanced", "QUEST+") are poor image-search terms, so
// map them to a topic query. Ordered: first matching keyword wins, generic settlement
// default otherwise. Keep the keywords lowercase — matched against the lowercased title.
const PEXELS_QUERY_RULES: Array<[RegExp, string]> = [
  [/english|conversation|language|esl/, 'english conversation class'],
  [/job|career|employ|resume|hiring|worksafe|interview/, 'job fair career workshop'],
  [/senior|55\+|elder|memory/, 'seniors community group'],
  [/family|kids|child|parent|youth/, 'family community centre'],
  [/tai chi|qi gong|dance|yoga|exercise|walk|fitness/, 'community exercise class'],
  [/health|cancer|screening|wellness|clinic|mental/, 'community health workshop'],
  [/housing|rental|tenant|co-op|home/, 'apartment housing keys'],
  [/digital|computer|tech|online skill/, 'computer skills class'],
  [/food|cook|cafe|meal|kitchen|dinner/, 'community kitchen cooking'],
];
const PEXELS_QUERY_DEFAULT = 'community centre newcomers canada';

function pexelsQueryForEvent(title: string): string {
  const t = title.toLowerCase();
  for (const [re, query] of PEXELS_QUERY_RULES) {
    if (re.test(t)) return query;
  }
  return PEXELS_QUERY_DEFAULT;
}

/**
 * Tier-2 cover: a Pexels photo for the event's topic, or null if none (missing key / no
 * results). `cache` memoises the candidate LIST per query for one crawler run, so the
 * image-less events cost a handful of API calls; the per-event `seed` (hashStr of the
 * link) then picks a stable photo from that list, keeping same-topic covers varied and
 * unchanged across re-crawls. Caching the in-flight promise also dedupes concurrent calls.
 */
export async function pexelsImage(
  title: string,
  seed: number,
  cache: Map<string, Promise<string[]>>,
): Promise<string | null> {
  const query = pexelsQueryForEvent(title);
  let candidates = cache.get(query);
  if (!candidates) {
    candidates = fetchPexelsCandidates(query);
    cache.set(query, candidates);
  }
  const urls = await candidates;
  if (urls.length === 0) return null;
  return urls[seed % urls.length];
}

const ICON_URL_RE =
  /logo|icon|brand|favicon|placeholder|avatar|trademark|\/tm(?:[\/?#._-]|$)|spinner|badge|wp-content\/uploads.*logo/i;
const MIN_IMAGE_BYTES = 10 * 1024;
const IMAGE_HEAD_TIMEOUT_MS = 3000;

/**
 * Keep a source image only if it looks like a real photo: reject icon-ish URLs,
 * SSRF-guard, then HEAD-check the byte size (3s cap). Reject only on a positive
 * Content-Length below the threshold — a missing header, non-OK status, or a
 * thrown/timed-out request all keep the image (benefit of the doubt). Returns null when
 * there's no usable photo, so the caller applies the next tier.
 *
 * `redirect: 'manual'` completes the SSRF guard: without it an allowed public host could
 * 302 the probe to an internal address, which isPublicHttpUrl only ever saw the ORIGINAL
 * URL for. A 3xx now surfaces as a non-OK response, so we keep the original
 * (already-validated) URL and never fetch or store the redirect target. Cost: a
 * redirected image skips the size check — the same benefit-of-the-doubt the non-OK path
 * already takes, and cheaper than dropping the many legitimate http→https / CDN
 * redirects these hosts serve.
 */
export async function resolveImageUrl(url: string | null): Promise<string | null> {
  if (!url || typeof url !== 'string') return null;
  if (ICON_URL_RE.test(url)) return null;
  if (!isPublicHttpUrl(url)) return null; // SSRF guard before the HEAD fetch

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_HEAD_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'manual', // never follow a redirect off the validated host
      headers: { 'User-Agent': USER_AGENT },
    });
    if (!res.ok) return url; // non-OK ⇒ keep (benefit of the doubt)
    const lenHeader = res.headers.get('content-length');
    if (lenHeader !== null) {
      const bytes = Number(lenHeader);
      if (Number.isFinite(bytes) && bytes < MIN_IMAGE_BYTES) return null;
    }
    return url;
  } catch {
    return url;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The full three-tier resolution every adapter uses. `sourceImage` may be null when the
 * feed ships none — the Pexels and Unsplash tiers still guarantee a cover.
 */
export async function resolveCover(
  sourceImage: string | null,
  title: string,
  externalLink: string,
  cache: Map<string, Promise<string[]>>,
): Promise<string> {
  const seed = hashStr(externalLink);
  return (
    (await resolveImageUrl(sourceImage)) ??
    (await pexelsImage(title, seed, cache)) ??
    fallbackImage(externalLink)
  );
}
