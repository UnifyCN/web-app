// @ts-nocheck Deno runtime — Supabase Edge Functions (not part of the Next build)
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { isPublicHttpUrl } from '../_shared/ssrf.ts';
import { fetchPexelsCandidates } from '../_shared/pexels.ts';

// ============================================================================
// events-crawler — BC settlement-org events → public.events
// ----------------------------------------------------------------------------
// Cron-triggered (see 20260722120000_events_crawler.sql for the source column and
// 20260724120000_events_crawler_cron.sql for the schedule): pg_cron POSTs here
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
// deterministic Unsplash fallback pool. INSERT-only: no delete/prune. Rows outside
// the WINDOW_MONTHS rolling window are never ingested, and ones that age out of it
// simply stop matching the web reader's window filter — they are not removed,
// because mobile reads this same table with no date filter and a Past tab.
//
// Each row is tagged with a `genre` (see GENRE_RULES) so both apps can filter the
// tab by topic.
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
//
// NOTE on virtual events: none of these orgs sets Tribe's `is_virtual` flag (it ships
// with the paid Virtual Events add-on) — it is false or absent on every event. They mark
// online events by registering a venue named "Online" / "Webinar" instead, which is why
// isOnlineVenueName drives event_type. Don't rely on `is_virtual` alone.
//
// centrecanada.org is healthy but currently returns total:0 (empty upcoming calendar) —
// a zero count from it is expected, not a fetch failure.
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

// Rolling window: only events starting between today and today + 4 months are ingested,
// so the tab neither fills with far-future placeholders nor grows without bound. Enforced
// twice — as Tribe's ?end_date (server side) and again per row in tribeEventToRow, since
// an org's API ignoring the param would otherwise slip rows past the bound.
// The web reader (services/community.ts) applies the same 4-month window on read; keep the
// two in step. Nothing is ever deleted: mobile reads this shared table with no date filter
// at all and has a Past tab, so aged-out rows must stay.
const WINDOW_MONTHS = 4;

// How much of the description the genre tiebreaker scans. Long enough for the lede that
// actually describes the event, short enough to skip the registration/contact boilerplate.
const GENRE_DESCRIPTION_SCAN_CHARS = 400;

// Tribe reads ?start_date on the SITE's calendar, not UTC — see todayInTimezone.
// Every Phase-1 org is in BC, so one constant covers them all. When an org outside
// Pacific time is added to ORGS, give Org an optional `timezone` and fall back here.
const ORG_TIMEZONE = 'America/Vancouver';

// Cover images are chosen in three tiers (see tribeEventToRow):
//   1. the event's own featured image (resolveImageUrl — icon-filtered, SSRF-guarded,
//      size-checked),
//   2. a Pexels stock photo matching the event's topic (pexelsImage) — INERT unless the
//      PEXELS_API_KEY edge-function secret is set,
//   3. this deterministic Unsplash pool, the always-available last resort.
//
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

// Raw event titles ("Tai Chi – 48 Advanced", "QUEST+") are poor image-search terms, so map
// them to a topic query. Ordered: first matching keyword wins, generic settlement default
// otherwise. Keep the keywords lowercase — matched against the lowercased title.
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
 * results). `pexelsCache` memoises the candidate LIST per query for one crawler run, so the
 * ~28 image-less events cost a handful of API calls; the per-event `seed` (hashStr of the
 * link) then picks a stable photo from that list, keeping same-topic covers varied and
 * unchanged across re-crawls. Caching the in-flight promise also dedupes concurrent calls.
 */
async function pexelsImage(
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

// ---- genre tagging --------------------------------------------------------

// public.events.genre is a pre-existing shared column (default 'Uncategorized'). The
// mobile app types it as EventGenre and ships a genre chip filter that is currently
// commented out; the first five values below are exactly its enum, so nothing renames
// when Savar uncomments it — Language/Health/Family/Education are purely additive.
type EventGenre =
  | 'Employment'
  | 'Language'
  | 'Housing'
  | 'Finance'
  | 'Documentation'
  | 'Health'
  | 'Family'
  | 'Education'
  | 'Socials'
  | 'Uncategorized';

// Same shape as PEXELS_QUERY_RULES: ordered, first match wins, lowercase keywords.
// ORDER IS LOAD-BEARING:
//   - Employment precedes Language because S.U.C.C.E.S.S. titles all carry
//     "(English, Multilingual Translation Captions Available)" — matching Language
//     first would file every employment workshop under Language.
//   - Housing matches `housing`, never a bare `hous`, or "Belkin House" lands there.
//   - Employment precedes Family so "Foreign Credential Recognition … Family Medicine
//     Licensing" reads as a career event, not a family one.
// Verified against the 69 rows already crawled into prod: 69/69 classified, 0 fallthrough.
const GENRE_RULES: Array<[RegExp, EventGenre]> = [
  [
    /job|career|employ|resume|hiring|worksafe|workplace|interview|credential|licens|internationally (educated|trained)|profession|nurse|physician|labour market/,
    'Employment',
  ],
  [/english|\besl\b|\blinc\b|language|conversation circle|french|francais/, 'Language'],
  [/housing|rental|renting|tenant|landlord|lease|shelter|homeless/, 'Housing'],
  [
    /tax|bank|budget|financ|money|credit|benefit|insurance|pension|income|subsid|rrsp|tfsa|debt|saving/,
    'Finance',
  ],
  [
    /immigration|citizenship|permanent resident|pr card|work permit|study permit|sin card|legal|lawyer|notary|settlement|orientation|document|visa/,
    'Documentation',
  ],
  [
    /health|clinic|wellness|mental|counsel|cancer|screening|nutrition|dental|emotion|stress|mindful|yoga|tai chi|qi gong|exercise|fitness|walkathon|memory|dementia|therapy|doctor|medical|wellbeing/,
    'Health',
  ],
  [/famil|child|kid|parent|youth|toddler|baby|preschool|caregiver|prenatal|daycare/, 'Family'],
  [/digital|computer|tech|literacy|skill|training|course|tutor|school|scholarship/, 'Education'],
  // Last rule, so these keywords only ever catch events no earlier rule claimed. That's
  // why the loose recreational-outing terms (explore, market, tour) are safe here and
  // would not be higher up: "explore available pathways" and "labour market" already
  // belong to Employment by the time this runs.
  [
    /social|communit|cafe|café|club|dance|mahjong|party|celebrat|potluck|festival|connect|meetup|drop-?in|peer|volunteer|friend|game|craft|garden|coffee|lunch|dinner|cook|meal|kitchen|immigrant|refugee|newcomer|explore|tour\b|trip\b|outing|excursion|museum|farm|winery|orchard|hike|picnic|market|sightsee/,
    'Socials',
  ],
];

function matchGenre(text: string): EventGenre | null {
  for (const [re, genre] of GENRE_RULES) {
    if (re.test(text)) return genre;
  }
  return null;
}

/**
 * Two passes: the title first, then the description as a tiebreaker. Title-only leaves
 * opaque names ("QUEST+", "Seniors First BC", "Senior Farsi & Dari Program") uncategorized;
 * matching both at once lets description boilerplate outvote a clear title signal. Running
 * the description only when the title says nothing gets both — on the 69 rows already in
 * prod just 5 fall through to the second pass.
 */
function genreForEvent(title: string, description: string | null): EventGenre {
  return (
    matchGenre(title.toLowerCase()) ??
    matchGenre((description ?? '').slice(0, GENRE_DESCRIPTION_SCAN_CHARS).toLowerCase()) ??
    'Uncategorized'
  );
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
  genre: EventGenre;
  source: string;
}

// ---- text helpers (dependency-free) ---------------------------------------

/**
 * `String.fromCodePoint` throws RangeError for anything outside 0…0x10FFFF — a feed
 * carrying `&#99999999;` or `&#x7FFFFFFF;` is enough. That throw would escape
 * decodeEntities() through clean()/htmlToParagraphs() and tribeEventToRow into
 * fetchOrgEvents' catch, which returns [] — so ONE malformed entity in ONE item would
 * discard that org's whole batch. Out-of-range values therefore keep their literal
 * source text (`raw`) rather than throwing or being silently dropped.
 */
function codePointOr(raw: string, n: number): string {
  return Number.isInteger(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : raw;
}

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
    .replace(/&#(\d+);/g, (m, n) => codePointOr(m, Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (m, n) => codePointOr(m, parseInt(n, 16)));
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

// Venue names that denote a virtual room rather than a physical place. These orgs
// register a venue literally named "Online" or "Webinar" and never set Tribe's
// `is_virtual` (it needs the paid Virtual Events add-on), so the venue NAME is the only
// signal that an event is online — without this every webinar types as in-person.
const VIRTUAL_STRONG = new Set([
  'online', 'virtual', 'webinar', 'zoom', 'remote', 'teleconference', 'livestream',
  'webex', 'teams', 'meet',
]);
const VIRTUAL_FILLER = new Set([
  'event', 'events', 'meeting', 'session', 'workshop', 'only', 'platform', 'via', 'web',
  'google', 'ms', 'microsoft', 'stream', 'live',
]);

/**
 * True when the whole venue name is virtual vocabulary ("Online", "Webinar",
 * "Online (Zoom)", "Virtual Event"). Matches the ENTIRE name rather than searching for a
 * substring, so a physical venue that merely contains one of these words — "Online
 * Learning Centre, 123 Main St" — is not misread as virtual.
 */
function isOnlineVenueName(name: string): boolean {
  const tokens = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return false;
  if (!tokens.every((t) => VIRTUAL_STRONG.has(t) || VIRTUAL_FILLER.has(t))) return false;
  return tokens.some((t) => VIRTUAL_STRONG.has(t));
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

/**
 * Keep a source image only if it looks like a real photo: reject icon-ish URLs,
 * SSRF-guard, then HEAD-check the byte size (3s cap). Reject only on a positive
 * Content-Length below the threshold — a missing header, non-OK status, or a
 * thrown/timed-out request all keep the image (benefit of the doubt). Returns null
 * when there's no usable photo, so the caller applies the fallback pool.
 *
 * `redirect: 'manual'` completes the SSRF guard: without it an allowed public host
 * could 302 the probe to an internal address, which isPublicHttpUrl only ever saw
 * the ORIGINAL URL for. A 3xx now surfaces as a non-OK response, so we keep the
 * original (already-validated) URL and never fetch or store the redirect target.
 * Cost: a redirected image skips the size check — the same benefit-of-the-doubt
 * the non-OK path already takes, and cheaper than dropping the many legitimate
 * http→https / CDN redirects these WordPress hosts serve.
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
      redirect: 'manual', // never follow a redirect off the validated host
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
 * into a valid row (missing NOT-NULL data, undeterminable location, past, hidden,
 * or starting beyond the rolling window).
 * Image resolution is async (HEAD check + optional Pexels search), so this is async.
 * `pexelsCache` is the run-scoped per-query memo threaded down from the handler.
 */
async function tribeEventToRow(
  ev: any,
  org: Org,
  pexelsCache: Map<string, Promise<string[]>>,
  windowEndMs: number,
): Promise<EventRow | null> {
  if (!ev || typeof ev !== 'object') return null;
  if (ev.status && ev.status !== 'publish') return null;
  if (ev.hide_from_listings === true) return null;

  const title = clean(ev.title).slice(0, MAX_TITLE_CHARS);
  const externalLink = typeof ev.url === 'string' ? ev.url.trim() : '';
  const eventDatetime = toIsoUtc(ev.utc_start_date);
  if (!title || !externalLink || !eventDatetime) return null; // NOT NULL columns

  // Backstop for ?end_date — see fetchOrgEvents. Runs before the image work below so a
  // far-future event costs no HEAD probe or Pexels lookup.
  if (Date.parse(eventDatetime) > windowEndMs) return null;

  // location + event_type from the venue NAME first, then venue presence, then the
  // virtual flag — see isOnlineVenueName for why the name has to win.
  const venue = ev.venue;
  const hasVenue =
    venue && typeof venue === 'object' && !Array.isArray(venue) && !!clean(venue.venue);
  const isVirtual = ev.is_virtual === true;
  const venueName = hasVenue ? clean(venue.venue) : '';

  let location: string;
  let eventType: EventRow['event_type'];
  if (hasVenue && isOnlineVenueName(venueName)) {
    location = venueName; // keep the source wording ('Online' / 'Webinar')
    eventType = 'online';
  } else if (hasVenue) {
    location = venueName;
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
  // Three tiers: source image → Pexels topic photo → deterministic Unsplash pool.
  const seed = hashStr(externalLink);
  const coverPhotoUrl =
    (await resolveImageUrl(imageUrl)) ??
    (await pexelsImage(title, seed, pexelsCache)) ??
    fallbackImage(externalLink);

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
    genre: genreForEvent(title, description),
    source: `crawler:${org.slug}`,
  };
}

/**
 * Today's date as YYYY-MM-DD on `timeZone`'s calendar, NOT UTC's.
 *
 * Tribe interprets ?start_date in the site's own timezone, so using the UTC date
 * would silently drop events happening later the same local day for any run between
 * 00:00Z and 08:00Z — the window where UTC has already rolled over to tomorrow but
 * Vancouver has not. The scheduled Monday 14:00 UTC run is outside that window, but a
 * manual or rescheduled run lands in it easily. 'en-CA' already formats as YYYY-MM-DD,
 * so no manual part assembly is needed.
 */
function todayInTimezone(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * The far edge of the rolling window as YYYY-MM-DD, `months` after today on `timeZone`'s
 * calendar — the ?end_date counterpart to todayInTimezone's ?start_date.
 *
 * Date.UTC normalises overflow, so a short target month rolls forward rather than throwing
 * (Oct 31 + 4 months → Feb 31 → Mar 3). A couple of days of slack on the far edge of a
 * four-month bound doesn't matter; being off by a whole month would.
 */
function windowEndInTimezone(
  timeZone: string,
  months: number,
  now: Date = new Date(),
): string {
  const [year, month, day] = todayInTimezone(timeZone, now).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1 + months, day)).toISOString().slice(0, 10);
}

async function fetchOrgEvents(
  org: Org,
  pexelsCache: Map<string, Promise<string[]>>,
): Promise<EventRow[]> {
  const today = todayInTimezone(ORG_TIMEZONE); // YYYY-MM-DD on the org's calendar
  const windowEnd = windowEndInTimezone(ORG_TIMEZONE, WINDOW_MONTHS);
  // Deliberately loose: parsed as UTC while the date itself is on the org's calendar, so
  // the per-row guard trails ?end_date by a few hours. It exists to catch an org whose API
  // ignores end_date outright (events years out), not to police the boundary hour.
  const windowEndMs = Date.parse(`${windowEnd}T23:59:59Z`);
  const url =
    `https://${org.host}/wp-json/tribe/events/v1/events` +
    `?per_page=${MAX_PER_ORG}&start_date=${today}%2000:00:00&end_date=${windowEnd}%2023:59:59`;

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
      events
        .slice(0, MAX_PER_ORG)
        .map((ev: unknown) => tribeEventToRow(ev, org, pexelsCache, windowEndMs)),
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

  // Fetch every org concurrently. One Pexels candidate-list cache per run, shared across
  // all orgs, so identical topic queries hit the API once.
  const pexelsCache = new Map<string, Promise<string[]>>();
  const perOrgResults = await Promise.all(
    ORGS.map(async (org) => ({ slug: org.slug, rows: await fetchOrgEvents(org, pexelsCache) })),
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

  // Dedupe against the DB by external_link. The real guarantee is the unique index
  // events_external_link_key (20260724130000_events_external_link_unique.sql) paired
  // with the ignoreDuplicates upsert below — a read-then-insert alone would race, since
  // a manual trigger overlapping the cron could have both runs pass this check. This
  // filter is defence-in-depth: it keeps the common case from shipping rows the DB
  // would only discard, and it keeps `inserted` meaningful.
  //
  // Scoped to THIS batch's links rather than selecting the whole column, so the lookup
  // can never be silently truncated by the API row cap as the table grows. Scoping by
  // link (not by source) keeps the manual-row protection: a link Savar entered by hand
  // still blocks a crawler re-insert.
  //
  // Chunked because the filter travels in a GET query string: links run ~140 chars
  // (~200 URL-encoded), so 25 per request keeps it near 5KB, well under the gateway's
  // ~8KB request-line cap. Batch max is ORGS.length * MAX_PER_ORG = 125 → ≤5 calls.
  const EXISTING_LOOKUP_CHUNK = 25;
  const existingLinks = new Set<string>();
  for (let i = 0; i < batch.length; i += EXISTING_LOOKUP_CHUNK) {
    const chunk = batch.slice(i, i + EXISTING_LOOKUP_CHUNK).map((row) => row.external_link);
    const { data: existing, error: existingError } = await supabase
      .from('events')
      .select('external_link')
      .in('external_link', chunk);
    if (existingError) {
      console.error('events-crawler: existing-link select failed:', existingError);
      return jsonResponse({ error: 'Select failed', detail: existingError.message }, 500);
    }
    for (const row of (existing ?? []) as { external_link: string | null }[]) {
      if (row.external_link) existingLinks.add(row.external_link);
    }
  }
  const toInsert = batch.filter((row) => !existingLinks.has(row.external_link));

  if (toInsert.length === 0) {
    return jsonResponse({ ok: true, perOrg, fetched: batch.length, inserted: 0 });
  }

  // ON CONFLICT (external_link) DO NOTHING via the UNIQUE index, so a run that loses
  // the race to a concurrent invocation is a silent no-op instead of a 23505. .select()
  // returns only the rows actually inserted, so its length is the true insert count.
  const { data, error } = await supabase
    .from('events')
    .upsert(toInsert, { onConflict: 'external_link', ignoreDuplicates: true })
    .select('id');
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
