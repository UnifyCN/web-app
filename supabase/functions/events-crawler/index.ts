// @ts-nocheck Deno runtime — Supabase Edge Functions (not part of the Next build)
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

// ============================================================================
// events-crawler — BC settlement-org events → public.events
// ----------------------------------------------------------------------------
// Cron-triggered (see 20260701120000_events_crawler.sql): pg_cron POSTs here
// with the service-role key as the Bearer token. The function pulls upcoming
// events from WordPress "The Events Calendar" (Tribe) JSON REST APIs and inserts
// new rows into public.events, shaped IDENTICALLY to the events Savar enters by
// hand (same columns, same CommunityEvent render path in EventCard.tsx + the
// event detail page). Scraped rows are tagged `source = 'crawler:<org>'` so they
// stay distinguishable from manual rows.
//
// Mirrors supabase/functions/news-crawler/index.ts: same service-role Bearer
// auth (verify_jwt=true, no CORS — server-to-server only), the same image-quality
// trio (icon-URL reject + SSRF guard + HEAD size check), and the same
// deterministic Unsplash fallback pool. INSERT-only: no delete/prune (past events
// fall out of the web reader's `event_datetime > now` filter naturally).
//
// Shared prod DB (web + mobile) — inserted events appear in BOTH apps immediately.
// ============================================================================

interface Org {
  /** Stored into source as `crawler:<slug>`. */
  slug: string;
  /** Fallback hosted_by / display name when the event has no organizer. */
  name: string;
  /** WordPress host serving /wp-json/tribe/events/v1/events. */
  host: string;
}

// Phase 1: the five highest-relevance orgs, all on The Events Calendar (Tribe).
// Add an org here (test /wp-json/tribe/events/v1/events first) to broaden coverage;
// remember to allowlist its image host in next.config.ts.
const ORGS: Org[] = [
  { slug: 'mosaic', name: 'MOSAIC', host: 'mosaicbc.org' },
  { slug: 'burnaby-nh', name: 'Burnaby Neighbourhood House', host: 'burnabynh.ca' },
  { slug: 'success', name: 'S.U.C.C.E.S.S.', host: 'successbc.ca' },
  { slug: 'centre-canada', name: 'CentreCanada', host: 'centrecanada.org' },
  { slug: 'pirs', name: 'Pacific Immigrant Resources Society', host: 'pirs.bc.ca' },
];

const MAX_PER_ORG = 25; // soonest-first cap so MOSAIC's ~254 events don't flood the tab
const MAX_DESCRIPTION_CHARS = 2000;
const MAX_TITLE_CHARS = 300;
const FETCH_TIMEOUT_MS = 20000;

// Topic-appropriate Unsplash fallback pool (images.unsplash.com is allowlisted in
// next.config.ts) for events whose source ships no usable cover. All ids are reused
// from the production news-crawler pools (already verified 200 image/jpeg) so none
// 404. Stable photo-<id> form only. Per the never-null-image convention, but events
// keep the DB column nullable — the reused pool means we still supply one.
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

// Deterministic non-crypto string hash so a given event link always maps to the
// same pool image (stable across re-crawls) while different links spread across it.
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function fallbackImage(link: string): string {
  return EVENTS_FALLBACK_POOL[hashStr(link) % EVENTS_FALLBACK_POOL.length];
}

interface EventRow {
  title: string;
  description: string | null;
  event_datetime: string;
  event_end_datetime: string | null;
  location: string;
  event_type: 'in-person' | 'online' | 'hybrid';
  cover_photo_url: string | null;
  external_link: string;
  hosted_by: string | null;
  address: string | null;
  source: string;
}

// ---- text helpers (dependency-free) ---------------------------------------

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
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&#8216;|&#8217;/g, "'")
    .replace(/&#8220;|&#8221;/g, '"')
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCodePoint(parseInt(n, 16)));
}

/** Decode entities, collapse whitespace, trim. For single-line fields (title, venue). */
function clean(value: string | null | undefined): string {
  if (!value) return '';
  return decodeEntities(String(value)).replace(/\s+/g, ' ').trim();
}

/**
 * Convert an HTML fragment to plain text that PRESERVES paragraph breaks as `\n`
 * (the event detail page splits description on `\n` to render paragraphs). Block-ish
 * tags become newlines; remaining tags are stripped; entities decoded; runs of
 * blank lines collapsed. Settlement-org bodies (esp. MOSAIC's Cvent form markup)
 * carry heavy nesting, so we normalise aggressively.
 */
function htmlToParagraphs(html: string | null | undefined): string {
  if (!html) return '';
  const withBreaks = String(html)
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/\s*(p|div|li|ul|ol|h[1-6]|tr|blockquote)\s*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ');
  return decodeEntities(withBreaks)
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, MAX_DESCRIPTION_CHARS);
}

/** Tribe `utc_start_date`/`utc_end_date` ("YYYY-MM-DD HH:MM:SS", UTC) → ISO Z. */
function toIsoUtc(value: string | null | undefined): string | null {
  if (!value || typeof value !== 'string') return null;
  const m = value.trim().match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/);
  if (!m) return null;
  const iso = `${m[1]}T${m[2]}Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// ---- image quality trio (reused from news-crawler) ------------------------

const ICON_URL_RE =
  /logo|icon|brand|favicon|placeholder|avatar|trademark|\/tm(?:[\/?#._-]|$)|spinner|badge|wp-content\/uploads.*logo/i;
const MIN_IMAGE_BYTES = 10 * 1024;
const IMAGE_HEAD_TIMEOUT_MS = 3000;

// SSRF guard: only HEAD public http(s) URLs. Rejects non-http(s) schemes and hosts
// in localhost / loopback / private / link-local ranges — the crawler runs
// server-side with the service role, so a crafted image URL must never reach an
// internal host.
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
    if (a === 0) return false; // 0.0.0.0/8
  }
  return true;
}

/**
 * Keep a source image only if it looks like a real photo: reject icon-ish URLs,
 * SSRF-guard, then HEAD-check the byte size (3s cap). Reject only on a positive
 * Content-Length below the threshold — a missing header, non-OK status, or a
 * thrown/timed-out request all keep the image (benefit of the doubt). Returns null
 * when there's no usable photo, so the caller applies the fallback pool.
 */
async function resolveImageUrl(url: string | null): Promise<string | null> {
  if (!url || typeof url !== 'string') return null;
  if (ICON_URL_RE.test(url)) return null;
  if (!isPublicHttpUrl(url)) return null; // SSRF guard before the HEAD fetch

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_HEAD_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      headers: { 'User-Agent': 'UnifyEventsBot/1.0 (+https://unifysocial.ca)' },
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

// ---- Tribe REST → EventRow -------------------------------------------------

function organizerName(organizer: unknown): string | null {
  if (!Array.isArray(organizer) || organizer.length === 0) return null;
  const first = organizer[0];
  if (typeof first === 'string') return clean(first) || null;
  if (first && typeof first === 'object' && typeof (first as any).organizer === 'string') {
    return clean((first as any).organizer) || null;
  }
  return null;
}

/**
 * Map one Tribe REST event object to an EventRow, or null when it can't be shaped
 * into a valid row (missing NOT-NULL data, undeterminable location, past, hidden).
 * Image resolution is async (HEAD check), so this is async.
 */
async function tribeEventToRow(ev: any, org: Org): Promise<EventRow | null> {
  if (!ev || typeof ev !== 'object') return null;
  if (ev.status && ev.status !== 'publish') return null;
  if (ev.hide_from_listings === true) return null;

  const title = clean(ev.title).slice(0, MAX_TITLE_CHARS);
  const externalLink = typeof ev.url === 'string' ? ev.url.trim() : '';
  const eventDatetime = toIsoUtc(ev.utc_start_date);
  if (!title || !externalLink || !eventDatetime) return null; // NOT NULL columns

  // location + event_type from venue presence and the virtual flag.
  const venue = ev.venue;
  const hasVenue =
    venue && typeof venue === 'object' && !Array.isArray(venue) && !!clean(venue.venue);
  const isVirtual = ev.is_virtual === true;

  let location: string;
  let eventType: EventRow['event_type'];
  if (hasVenue) {
    location = clean(venue.venue);
    eventType = isVirtual ? 'hybrid' : 'in-person';
  } else if (isVirtual) {
    location = 'Online';
    eventType = 'online';
  } else {
    return null; // neither a venue nor a virtual flag → no reliable location
  }

  // description: prefer the (usually cleaner) excerpt, fall back to the body.
  const excerpt = htmlToParagraphs(ev.excerpt);
  const body = htmlToParagraphs(ev.description);
  const description = (excerpt.length >= 40 ? excerpt : body) || null;

  const address =
    hasVenue && clean(venue.address)
      ? [venue.address, venue.city, venue.stateprovince || venue.province, venue.zip]
          .map((p: unknown) => clean(p as string))
          .filter(Boolean)
          .join(', ')
      : null;

  const imageUrl =
    ev.image && typeof ev.image === 'object' && typeof ev.image.url === 'string'
      ? ev.image.url
      : null;
  const coverPhotoUrl = (await resolveImageUrl(imageUrl)) ?? fallbackImage(externalLink);

  return {
    title,
    description,
    event_datetime: eventDatetime,
    event_end_datetime: toIsoUtc(ev.utc_end_date),
    location,
    event_type: eventType,
    cover_photo_url: coverPhotoUrl,
    external_link: externalLink,
    hosted_by: organizerName(ev.organizer) ?? org.name,
    address,
    source: `crawler:${org.slug}`,
  };
}

async function fetchOrgEvents(org: Org): Promise<EventRow[]> {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  const url =
    `https://${org.host}/wp-json/tribe/events/v1/events` +
    `?per_page=${MAX_PER_ORG}&start_date=${today}%2000:00:00`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'UnifyEventsBot/1.0 (+https://unifysocial.ca)',
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      console.error(`events-crawler: ${org.slug} returned HTTP ${res.status}`);
      return [];
    }
    const data = await res.json();
    const events = Array.isArray(data?.events) ? data.events : [];
    const rows = await Promise.all(
      events.slice(0, MAX_PER_ORG).map((ev: unknown) => tribeEventToRow(ev, org)),
    );
    return rows.filter((r): r is EventRow => r !== null);
  } catch (error) {
    console.error(`events-crawler: failed to fetch ${org.slug}:`, error);
    return [];
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
 * malformed token.
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
  // exact service-role-key match OR any token whose verified role is service_role. On
  // rejection, log the presented role (never the token).
  const token = req.headers.get('Authorization')?.replace('Bearer ', '').trim();
  const authorized =
    !!token &&
    (token === serviceRoleKey.trim() || jwtRole(token) === 'service_role');
  if (!authorized) {
    console.error(
      `events-crawler: unauthorized — bearer role=${
        token ? (jwtRole(token) ?? 'unknown') : 'missing'
      }`,
    );
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Fetch every org concurrently.
  const perOrgResults = await Promise.all(
    ORGS.map(async (org) => ({ slug: org.slug, rows: await fetchOrgEvents(org) })),
  );

  const collected: EventRow[] = [];
  const perOrg: Record<string, number> = {};
  for (const { slug, rows } of perOrgResults) {
    perOrg[slug] = rows.length;
    collected.push(...rows);
  }

  // Dedupe within the batch by external_link.
  const seen = new Set<string>();
  const batch = collected.filter((row) => {
    if (seen.has(row.external_link)) return false;
    seen.add(row.external_link);
    return true;
  });

  if (batch.length === 0) {
    return jsonResponse({ ok: true, perOrg, fetched: 0, inserted: 0 });
  }

  // Dedupe against the DB by external_link. No unique index is created on the shared
  // events table (keeps Savar's manual inserts unconstrained); we filter in-function
  // and plain-insert the remainder. Check ALL rows so we never duplicate a link that
  // was entered manually either. Small table → cheap. Tiny race window is fine for a
  // weekly cron.
  const { data: existing, error: existingError } = await supabase
    .from('events')
    .select('external_link');
  if (existingError) {
    console.error('events-crawler: existing-link select failed:', existingError);
    return jsonResponse({ error: 'Select failed', detail: existingError.message }, 500);
  }
  const existingLinks = new Set(
    (existing ?? []).map((r: { external_link: string | null }) => r.external_link).filter(Boolean),
  );
  const toInsert = batch.filter((row) => !existingLinks.has(row.external_link));

  if (toInsert.length === 0) {
    return jsonResponse({ ok: true, perOrg, fetched: batch.length, inserted: 0 });
  }

  const { data, error } = await supabase.from('events').insert(toInsert).select('id');
  if (error) {
    console.error('events-crawler: insert failed:', error);
    return jsonResponse({ error: 'Insert failed', detail: error.message }, 500);
  }

  return jsonResponse({
    ok: true,
    perOrg,
    fetched: batch.length,
    inserted: data?.length ?? 0,
  });
});
