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
const FEEDS: Feed[] = [
  { url: 'https://www.cicnews.com/feed', source: 'CIC News', category: 'Immigration' },
  {
    url: 'https://api.io.canada.ca/io-server/gc/news/en/v2?dept=departmentofcitizenshipandimmigration&type=newsreleases&pick=25&format=atom',
    source: 'IRCC',
    category: 'Immigration',
  },
  { url: 'https://canadianimmigrant.ca/feed', source: 'Canadian Immigrant', category: 'Immigration' },
  // Service Canada / ESDC — benefits, EI, SIN, employment. (canada.ca dept feeds
  // key off the legal department name; the .atom.xml path the source links is dead.)
  {
    url: 'https://api.io.canada.ca/io-server/gc/news/en/v2?dept=departmentofemploymentandsocialdevelopment&type=newsreleases&pick=25&format=atom',
    source: 'Service Canada',
    category: 'Benefits',
  },
  {
    url: 'https://api.io.canada.ca/io-server/gc/news/en/v2?dept=departmentofhealth&type=newsreleases&pick=25&format=atom',
    source: 'Health Canada',
    category: 'Health',
  },
  // All-department federal newsroom (no dept filter). Overlaps the dept feeds
  // above; the link-dedup in the handler collapses the duplicates.
  {
    url: 'https://api.io.canada.ca/io-server/gc/news/en/v2?type=newsreleases&pick=25&format=atom',
    source: 'Government of Canada',
    category: 'Government',
  },
];

const MAX_ITEMS_PER_FEED = 15;
const MAX_DESCRIPTION_CHARS = 400;
const FETCH_TIMEOUT_MS = 20000;

// Topic-appropriate Unsplash fallbacks (images.unsplash.com is allowlisted in the
// web app's next.config.ts), keyed by the feed's category, so every row carries a
// thumbnail even when the feed item ships no image. Per CLAUDE.md, news items must
// always have an image_link — never null. Stable photo-<id> form (short
// /photos/<slug> URLs 404 on the CDN).
const FALLBACK_IMAGE: Record<string, string> = {
  Immigration:
    'https://images.unsplash.com/photo-1523580846011-d3a5bc25702b?w=800&q=80&auto=format&fit=crop',
  Benefits:
    'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=800&q=80&auto=format&fit=crop',
  Health:
    'https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=800&q=80&auto=format&fit=crop',
  Government:
    'https://images.unsplash.com/photo-1517935706615-2717063c2225?w=800&q=80&auto=format&fit=crop',
};
// Canadian skyline — neutral default for any category without its own fallback.
const DEFAULT_FALLBACK_IMAGE = FALLBACK_IMAGE.Government;

function fallbackImage(category: string): string {
  return FALLBACK_IMAGE[category] ?? DEFAULT_FALLBACK_IMAGE;
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

function extractImage(block: string): string | null {
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

function parseFeed(xml: string, feed: Feed): NewsRow[] {
  const rows: NewsRow[] = [];
  for (const block of extractItemBlocks(xml).slice(0, MAX_ITEMS_PER_FEED)) {
    const title = clean(firstMatch(block, /<title[^>]*>([\s\S]*?)<\/title>/i));
    const link = extractLink(block);
    if (!title || !link) continue; // title is NOT NULL; link is the dedupe key

    const rawDescription =
      firstMatch(block, /<description>([\s\S]*?)<\/description>/i) ||
      firstMatch(block, /<summary[^>]*>([\s\S]*?)<\/summary>/i) ||
      firstMatch(block, /<content[^>]*>([\s\S]*?)<\/content>/i);
    const description = toPlainText(rawDescription).slice(0, MAX_DESCRIPTION_CHARS) || null;

    rows.push({
      title: title.slice(0, 300),
      description,
      author: feed.source,
      category: feed.category,
      date: parseDate(block),
      image_link: extractImage(block) ?? fallbackImage(feed.category),
      link: link.trim(),
    });
  }
  return rows;
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

// ---- handler --------------------------------------------------------------

Deno.serve(async (req: Request) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Missing Supabase env vars' }, 500);
  }

  // Server-to-server only: the cron job sends the service-role key as Bearer.
  // Trim both sides — a Vault secret stored with a trailing newline/space (a known
  // gremlin on this shared DB) would otherwise never match and 401 every run.
  const token = req.headers.get('Authorization')?.replace('Bearer ', '').trim();
  if (!token || token !== serviceRoleKey.trim()) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Fetch + parse every feed concurrently, then dedupe within the batch by link.
  const feedResults = await Promise.all(
    FEEDS.map(async (feed) => {
      const xml = await fetchFeed(feed.url);
      const rows = xml ? parseFeed(xml, feed) : [];
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

  return jsonResponse({
    ok: true,
    fetched: deduped.length,
    inserted: data?.length ?? 0,
    perFeed,
  });
});
