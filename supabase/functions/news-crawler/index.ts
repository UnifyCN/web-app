// @ts-nocheck Deno runtime — Supabase Edge Functions (not part of the Next build)
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

// ============================================================================
// news-crawler — weekly Canada/immigration news → public.news_details
// ----------------------------------------------------------------------------
// Cron-triggered (see 20260619130000_news_details_crawler.sql): pg_cron POSTs
// here weekly with the service-role key as the Bearer token. The function
// fetches a few RSS/Atom feeds, parses each item with a dependency-free
// extractor (handles both RSS <item> and Atom <entry>), and upserts new rows
// keyed on `link` (ON CONFLICT DO NOTHING via the UNIQUE index).
//
// Shared prod DB (web + mobile) — inserted news appears in both apps. No CORS:
// this is server-to-server only, gated on the service-role bearer.
// ============================================================================

interface Feed {
  url: string;
  /** Stored as news_details.author. */
  source: string;
  /** Stored as news_details.category (badge text). */
  category: string;
}

// Immigration/newcomer-focused sources. Add feeds here to broaden coverage;
// each row carries its source as the author and a default category.
// NOTE: the canada.ca io-server feeds REQUIRE sort=publishedDate&orderBy=desc —
// without it the endpoint returns its OLDEST entries first (a frozen 2020-2021
// archive), which then get stamped 2020 and look stale / get cleaned up.
const FEEDS: Feed[] = [
  { url: 'https://www.cicnews.com/feed', source: 'CIC News', category: 'Immigration' },
  {
    url: 'https://api.io.canada.ca/io-server/gc/news/en/v2?dept=departmentofcitizenshipandimmigration&type=newsreleases&sort=publishedDate&orderBy=desc&pick=25&format=atom',
    source: 'IRCC',
    category: 'Immigration',
  },
  { url: 'https://canadianimmigrant.ca/feed', source: 'Canadian Immigrant', category: 'Immigration' },
  { url: 'https://moving2canada.com/feed/', source: 'Moving2Canada', category: 'Immigration' },
  // Service Canada / ESDC — benefits, EI, SIN, employment. (canada.ca dept feeds
  // key off the legal department name; the .atom.xml path the source links is dead.)
  {
    url: 'https://api.io.canada.ca/io-server/gc/news/en/v2?dept=departmentofemploymentandsocialdevelopment&type=newsreleases&sort=publishedDate&orderBy=desc&pick=25&format=atom',
    source: 'Service Canada',
    category: 'Benefits',
  },
  {
    url: 'https://api.io.canada.ca/io-server/gc/news/en/v2?dept=departmentofhealth&type=newsreleases&sort=publishedDate&orderBy=desc&pick=25&format=atom',
    source: 'Health Canada',
    category: 'Health',
  },
  // NB: the all-department federal newsroom feed (no dept= filter) was removed — it
  // pulled newcomer-irrelevant content (corrections lockdowns, defence/NATO visits,
  // CBSA trade probes, etc.). Only targeted department + immigration sources remain.
  // Non-government sources — human stories, finance, housing, settlement guides — to
  // balance the government press releases. All verified (2026 items, real per-article
  // links).
  { url: 'https://www.moneysense.ca/feed/', source: 'MoneySense', category: 'Finance' },
  { url: 'https://cms.ratehub.ca/feed/', source: 'Ratehub', category: 'Housing' },
  { url: 'https://issbc.org/feed/', source: 'ISSofBC', category: 'Community' },
  { url: 'https://prepareforcanada.com/blog/feed', source: 'Prepare for Canada', category: 'Immigration' },
  { url: 'https://www.immigration.ca/feed/', source: 'immigration.ca', category: 'Immigration' },
];

const MAX_ITEMS_PER_FEED = 15;
const MAX_DESCRIPTION_CHARS = 400;
const FETCH_TIMEOUT_MS = 20000;

// Topic-appropriate Unsplash fallback POOLS (images.unsplash.com is allowlisted in
// next.config.ts), keyed by the feed's category. Government dept feeds ship no image
// in their RSS, so without this every such row would repeat ONE category image —
// instead each article deterministically gets a different pool image (hash of its
// link). Per CLAUDE.md news items always have an image_link — never null. Stable
// photo-<id> form only (short /photos/<slug> URLs 404); every id verified 200 image/jpeg.
const IMG = (id: string) =>
  `https://images.unsplash.com/${id}?w=800&q=80&auto=format&fit=crop`;

const FALLBACK_POOLS: Record<string, string[]> = {
  Immigration: [
    'photo-1588733103629-b77afe0425ce',
    'photo-1517935706615-2717063c2225',
    'photo-1568036998293-09f73fcd6835',
    'photo-1593478210686-8ec9852cff87',
    'photo-1578973615934-8d9cdb0792b4',
    'photo-1566438503908-4f8377461f58',
    'photo-1523580846011-d3a5bc25702b',
    'photo-1531206715517-5c0ba140b2b8',
  ].map(IMG),
  Benefits: [
    'photo-1686771416282-3888ddaf249b',
    'photo-1573497620053-ea5300f94f21',
    'photo-1511376979163-f804dff7ad7b',
    'photo-1635350736475-c8cef4b21906',
    'photo-1507679799987-c73779587ccf',
    'photo-1521791136064-7986c2920216',
    'photo-1517048676732-d65bc937f952',
    'photo-1499750310107-5fef28a66643',
    'photo-1487528278747-ba99ed528ebc',
    'photo-1573497491208-6b1acb260507',
  ].map(IMG),
  Health: [
    'photo-1532938911079-1b06ac7ceec7',
    'photo-1638202993928-7267aad84c31',
    'photo-1582750433449-648ed127bb54',
    'photo-1584432810601-6c7f27d2362b',
    'photo-1659353888906-adb3e0041693',
    'photo-1673865641073-4479f93a7776',
    'photo-1666887360388-93e684b6474a',
    'photo-1576091160550-2173dba999ef',
  ].map(IMG),
  Finance: [
    'photo-1526304640581-d334cdbbf45e',
    'photo-1604594849809-dfedbc827105',
    'photo-1518458028785-8fbcd101ebb9',
    'photo-1534951009808-766178b47a4f',
    'photo-1554224155-6726b3ff858f',
    'photo-1633158829585-23ba8f7c8caf',
    'photo-1633158829875-e5316a358c6f',
    'photo-1607863680198-23d4b2565df0',
  ].map(IMG),
  Housing: [
    'photo-1560518883-ce09059eeffa',
    'photo-1722487631997-cf1e0f92c2c4',
    'photo-1744782351841-9cc6b86a5add',
    'photo-1733244766159-f58f4184fd38',
    'photo-1742318592061-15c5f19e1e47',
    'photo-1643804926339-e94f0a655185',
    'photo-1634979149798-e9a118734e93',
    'photo-1685886069739-c1b96bba7953',
    'photo-1604445415362-2a9840bd5ff6',
    'photo-1603508102977-02688e3265fd',
  ].map(IMG),
  Community: [
    'photo-1517456793572-1d8efd6dc135',
    'photo-1697490251788-21888514f669',
    'photo-1517457373958-b7bdd4587205',
    'photo-1498661694102-0a3793edbe74',
    'photo-1642307063371-2e3e8909c3cb',
    'photo-1758272133542-b3107b947fc2',
    'photo-1761435739748-879d2ecf0c70',
    'photo-1758272133693-d2124dbe00de',
    'photo-1761957371985-3c6d08e9ec68',
    'photo-1758275557250-894dd1e8feb3',
  ].map(IMG),
};
// Canadian community imagery — neutral default for any category without its own pool.
const DEFAULT_POOL = FALLBACK_POOLS.Community;

// Deterministic non-crypto string hash so a given link always maps to the same pool
// image (stable across re-crawls) while different links spread across the pool.
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function fallbackImage(category: string, link: string): string {
  const pool = FALLBACK_POOLS[category] ?? DEFAULT_POOL;
  return pool[hashStr(link) % pool.length];
}

interface NewsRow {
  title: string;
  description: string | null;
  author: string;
  category: string;
  date: string;
  image_link: string | null;
  link: string;
}

// ---- parsing helpers (dependency-free) ------------------------------------

function decodeEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#0*39;/g, "'")
    .replace(/&#x0*27;/gi, "'")
    .replace(/&#0*160;/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCodePoint(parseInt(n, 16)));
}

function stripCdata(value: string): string {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
}

function clean(value: string | null | undefined): string {
  if (!value) return '';
  return decodeEntities(stripCdata(value)).replace(/\s+/g, ' ').trim();
}

/** Strip HTML tags, decode entities, collapse whitespace. */
function toPlainText(value: string | null | undefined): string {
  if (!value) return '';
  return decodeEntities(stripCdata(value).replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function firstMatch(block: string, regex: RegExp): string | null {
  const m = block.match(regex);
  return m ? m[1] : null;
}

/** Split a feed body into its per-item blocks (RSS <item> or Atom <entry>). */
function extractItemBlocks(xml: string): string[] {
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi);
  if (items && items.length > 0) return items;
  const entries = xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi);
  return entries ?? [];
}

function extractLink(block: string): string | null {
  // RSS: <link>https://…</link> with a non-empty text body.
  const rss = firstMatch(block, /<link>\s*([^<]+?)\s*<\/link>/i);
  if (rss && /^https?:\/\//i.test(rss.trim())) return rss.trim();
  // Atom: prefer rel="alternate", else the first href.
  const alt = firstMatch(
    block,
    /<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i,
  );
  if (alt) return alt;
  return firstMatch(block, /<link[^>]*href=["']([^"']+)["']/i);
}

function extractImageCandidate(block: string): string | null {
  const media =
    firstMatch(block, /<media:content[^>]*url=["']([^"']+)["']/i) ||
    firstMatch(block, /<media:thumbnail[^>]*url=["']([^"']+)["']/i);
  if (media) return media;
  const enclosure = firstMatch(
    block,
    /<enclosure[^>]*url=["']([^"']+)["'][^>]*type=["']image\//i,
  );
  if (enclosure) return enclosure;
  // Fallback: first <img src> inside the content/description HTML.
  const inline = firstMatch(block, /<img[^>]*src=["']([^"']+)["']/i);
  if (inline && /^https?:\/\//i.test(inline)) return inline;
  return null;
}

// Reject obvious non-photos (logos / brand marks / icons) so they don't become
// article thumbnails — the per-category Unsplash fallback takes over instead.
// 1) URL-pattern rejection (case-insensitive). `icon` subsumes `favicon` and
//    `logo` subsumes `wp-content/uploads.*logo`; both kept explicit per spec.
//    `\/tm(?:[\/?#._-]|$)` matches "/tm" only as a complete path segment (so it
//    catches /tm, /tm/, /tm.png, /tm-x, /tm?… but NOT /tmp/).
const ICON_URL_RE =
  /logo|icon|brand|favicon|placeholder|avatar|trademark|\/tm(?:[\/?#._-]|$)|spinner|badge|wp-content\/uploads.*logo/i;
// 2) Anything under MIN_IMAGE_BYTES is almost certainly a logo/icon, not a photo.
const MIN_IMAGE_BYTES = 10 * 1024;
const IMAGE_HEAD_TIMEOUT_MS = 3000;

// SSRF guard: only HEAD public http(s) URLs. Rejects non-http(s) schemes and hosts
// in localhost / loopback / private / link-local ranges — the crawler runs
// server-side with the service role, so a crafted feed image URL must never reach
// an internal host.
function isPublicHttpUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost')) return false;
  if (host === '::1' || host === '[::1]') return false; // IPv6 loopback
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 127) return false; // loopback 127.0.0.0/8
    if (a === 10) return false; // private 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return false; // private 172.16.0.0/12
    if (a === 192 && b === 168) return false; // private 192.168.0.0/16
    if (a === 169 && b === 254) return false; // link-local 169.254.0.0/16
    if (a === 0) return false; // 0.0.0.0/8 (loopback-equivalent bypass)
  }
  return true;
}

/**
 * Extract the feed item's image and keep it only if it looks like a real photo:
 * reject icon-ish URLs, then HEAD-check the byte size (3s cap). Reject only on a
 * positive Content-Length below the threshold — a missing header, a non-OK status,
 * or a thrown/timed-out request all keep the image (benefit of the doubt). Returns
 * null when there's no usable photo, so the caller applies the category fallback.
 */
async function resolveImage(block: string): Promise<string | null> {
  const url = extractImageCandidate(block);
  if (!url) return null;
  if (ICON_URL_RE.test(url)) return null;
  if (!isPublicHttpUrl(url)) return null; // SSRF guard before the HEAD fetch

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_HEAD_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      headers: { 'User-Agent': 'UnifyNewsBot/1.0 (+https://unifysocial.ca)' },
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

function parseDate(block: string): string {
  const raw =
    firstMatch(block, /<pubDate>([\s\S]*?)<\/pubDate>/i) ||
    firstMatch(block, /<published>([\s\S]*?)<\/published>/i) ||
    firstMatch(block, /<updated>([\s\S]*?)<\/updated>/i) ||
    firstMatch(block, /<dc:date>([\s\S]*?)<\/dc:date>/i);
  const parsed = raw ? new Date(clean(raw)) : null;
  if (parsed && !Number.isNaN(parsed.getTime())) return parsed.toISOString();
  return new Date().toISOString();
}

async function parseFeed(xml: string, feed: Feed): Promise<NewsRow[]> {
  // Resolve every item (incl. its HEAD-checked image) concurrently so the image
  // validation adds ~one timeout to the feed, not one per item.
  const rows = await Promise.all(
    extractItemBlocks(xml)
      .slice(0, MAX_ITEMS_PER_FEED)
      .map(async (block): Promise<NewsRow | null> => {
        const title = clean(firstMatch(block, /<title[^>]*>([\s\S]*?)<\/title>/i));
        const link = extractLink(block);
        if (!title || !link) return null; // title is NOT NULL; link is the dedupe key

        const rawDescription =
          firstMatch(block, /<description>([\s\S]*?)<\/description>/i) ||
          firstMatch(block, /<summary[^>]*>([\s\S]*?)<\/summary>/i) ||
          firstMatch(block, /<content[^>]*>([\s\S]*?)<\/content>/i);
        const description =
          toPlainText(rawDescription).slice(0, MAX_DESCRIPTION_CHARS) || null;

        return {
          title: title.slice(0, 300),
          description,
          author: feed.source,
          category: feed.category,
          date: parseDate(block),
          image_link: (await resolveImage(block)) ?? fallbackImage(feed.category, link),
          link: link.trim(),
        };
      }),
  );
  return rows.filter((r): r is NewsRow => r !== null);
}

async function fetchFeed(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'UnifyNewsBot/1.0 (+https://unifysocial.ca)' },
    });
    if (!res.ok) {
      console.error(`Feed ${url} returned HTTP ${res.status}`);
      return null;
    }
    return await res.text();
  } catch (error) {
    console.error(`Failed to fetch feed ${url}:`, error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Read a JWT payload's `role` claim WITHOUT verifying the signature. Safe to trust
 * ONLY because this function runs with verify_jwt=true (config.toml) — the gateway
 * has already verified the signature before we get here. Returns null on any
 * malformed token. Used to accept any valid service-role token (robust to which
 * service-role key string the cron sends) and to log the role on a rejected call.
 */
function jwtRole(token: string): string | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const claims = JSON.parse(atob(padded)) as { role?: string };
    return typeof claims.role === 'string' ? claims.role : null;
  } catch {
    return null;
  }
}

// ---- handler --------------------------------------------------------------

Deno.serve(async (req: Request) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Missing Supabase env vars' }, 500);
  }

  // Server-to-server only: the cron sends the service-role key as Bearer. The gateway
  // (verify_jwt=true) has already verified the token's signature, so accept either an
  // exact service-role-key match (fast path; also covers a trailing-newline Vault
  // secret via trim) OR any token whose verified role is service_role — robust to
  // which valid service-role key string the cron happens to send. On rejection, log
  // the presented role (never the token) so a mismatch is instantly diagnosable
  // (e.g. an anon key mistakenly stored in the Vault service_role_key secret).
  const token = req.headers.get('Authorization')?.replace('Bearer ', '').trim();
  const authorized =
    !!token &&
    (token === serviceRoleKey.trim() || jwtRole(token) === 'service_role');
  if (!authorized) {
    console.error(
      `news-crawler: unauthorized — bearer role=${
        token ? (jwtRole(token) ?? 'unknown') : 'missing'
      }`,
    );
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Fetch + parse every feed concurrently, then dedupe within the batch by link.
  const feedResults = await Promise.all(
    FEEDS.map(async (feed) => {
      const xml = await fetchFeed(feed.url);
      const rows = xml ? await parseFeed(xml, feed) : [];
      return { source: feed.source, rows };
    }),
  );

  const collected: NewsRow[] = [];
  const perFeed: Record<string, number> = {};
  for (const { source, rows } of feedResults) {
    perFeed[source] = rows.length;
    collected.push(...rows);
  }

  const seen = new Set<string>();
  const deduped = collected.filter((row) => {
    if (seen.has(row.link)) return false;
    seen.add(row.link);
    return true;
  });

  if (deduped.length === 0) {
    return jsonResponse({ ok: true, fetched: 0, inserted: 0, perFeed });
  }

  // ON CONFLICT (link) DO NOTHING via the UNIQUE index; .select() returns only
  // the newly inserted rows, so its length is the insert count.
  const { data, error } = await supabase
    .from('news_details')
    .upsert(deduped, { onConflict: 'link', ignoreDuplicates: true })
    .select('id');
  if (error) {
    console.error('Insert failed:', error);
    return jsonResponse({ error: 'Insert failed', detail: error.message }, 500);
  }

  // Cap each SOURCE at its 5 most-recent articles (by date desc) so every feed
  // contributes regardless of publish frequency — a date-only global cap let prolific
  // sources crowd out the rest. Bounded at ~5 × #feeds rows. supabase-js has no window
  // functions, so fetch (id, author, date) newest-first and keep the first 5 per
  // author, then delete the remainder.
  const MAX_PER_SOURCE = 5;
  let pruned = 0;
  const { data: all, error: selectError } = await supabase
    .from('news_details')
    .select('id, author, date')
    .order('date', { ascending: false });
  if (selectError) console.error('Prune select failed:', selectError);
  const perSource: Record<string, number> = {};
  const keepIds: number[] = [];
  for (const row of all ?? []) {
    const n = perSource[row.author] ?? 0;
    if (n < MAX_PER_SOURCE) {
      keepIds.push(row.id);
      perSource[row.author] = n + 1;
    }
  }
  if (keepIds.length > 0 && keepIds.length < (all?.length ?? 0)) {
    const { data: removed, error: pruneError } = await supabase
      .from('news_details')
      .delete()
      .not('id', 'in', `(${keepIds.join(',')})`)
      .select('id');
    if (pruneError) console.error('Prune failed:', pruneError);
    else pruned = removed?.length ?? 0;
  }

  return jsonResponse({
    ok: true,
    fetched: deduped.length,
    inserted: data?.length ?? 0,
    pruned,
    perFeed,
  });
});
