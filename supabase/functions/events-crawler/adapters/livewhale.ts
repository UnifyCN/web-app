// Adapter: LiveWhale Calendar JSON (Simon Fraser University).
//
// SFU also publishes ICS at /live/ical/events, but the JSON feed is strictly better for
// our purposes: structured fields instead of RFC-5545 line folding, `\,` unescaping and
// CRLF handling, plus explicit cancelled / online / all-day flags the ICS doesn't carry.
//
// Two properties of this feed drive the whole design, both verified 2026-07-31:
//
//  1. RECURRING EVENTS REPEAT THE SAME `url`. Each occurrence is its own item, but every
//     occurrence of a series shares one canonical URL — a single gallery exhibition
//     accounted for 852 of the 1,000 items. Since `url` becomes external_link, which is
//     UNIQUE in the events table, they collapse to one row no matter what; the question
//     is only WHICH occurrence survives. Deduping to the SOONEST is what makes the
//     surviving row the next one a user could actually attend, and it stops one busy
//     series from consuming the whole MAX_PER_ORG cap.
//
//  2. MOST EVENTS ARE ALL-DAY (`is_all_day`, 927 of 1,000). For those, `date_utc` is
//     local midnight, so the stored time carries no real meaning — only the date does.
//     That is fine for both render paths (the card shows a date chip; the detail page
//     shows a date), and it is the best the source offers.
//
// The feed is also hard-capped at 1,000 items covering roughly four weeks. `?max=`,
// `/max|N`, `/starts_after|…`, `/range|…` and `/days|N` were all tested and none widen
// it. That is short of the 4-month window but harmless in practice: the cron runs weekly,
// so events enter the feed — and get ingested — as the horizon rolls forward.

import { FETCH_TIMEOUT_MS, MAX_PER_ORG, MAX_TITLE_CHARS, USER_AGENT } from '../lib/constants.ts';
import { toIsoUtc } from '../lib/dates.ts';
import { genreForEvent } from '../lib/genre.ts';
import { resolveCover } from '../lib/images.ts';
import { isSettlementRelevant } from '../lib/relevance.ts';
import { clean, htmlToParagraphs, isOnlineVenueName } from '../lib/text.ts';
import type { AdapterContext, EventRow, Source } from '../lib/types.ts';

/** LiveWhale sends 1 or null for booleans, never true/false. Accept both regardless. */
function isTruthy(value: unknown): boolean {
  return value === true || value === 1 || value === '1';
}

/**
 * LiveWhale documents relative `url` values (`/event/123-title`) even though SFU's feed
 * currently ships absolute ones. `external_link` is the canonical key and is rendered as a
 * link, so a relative value would be a broken row; take only absolute http(s) URLs.
 *
 * Note this is NOT an SSRF guard for the image path — `isPublicHttpUrl` already rejects a
 * relative string outright (verified: `isPublicHttpUrl('/events/12345') === false`), so a
 * relative thumbnail is dropped by resolveImageUrl and falls through to the stock tiers
 * rather than being fetched against the crawler's own origin.
 */
function absoluteHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    return u.protocol === 'http:' || u.protocol === 'https:' ? trimmed : null;
  } catch {
    return null;
  }
}

interface LiveWhaleEvent {
  title?: string;
  url?: string;
  /** "YYYY-MM-DD HH:MM:SS" in UTC — toIsoUtc's exact input shape. */
  date_utc?: string | null;
  date2_utc?: string | null;
  location?: string | null;
  location_title?: string | null;
  is_online?: unknown;
  is_canceled?: unknown;
  is_all_day?: unknown;
  thumbnail?: string | null;
  description?: string | null;
  group_title?: string | null;
}

interface Candidate {
  title: string;
  url: string;
  startIso: string;
  endIso: string | null;
  description: string | null;
  location: string;
  eventType: EventRow['event_type'];
  imageUrl: string | null;
  hostedBy: string | null;
}

function toCandidate(
  ev: LiveWhaleEvent,
  source: Source,
  ctx: AdapterContext,
): Candidate | null {
  if (!ev || typeof ev !== 'object') return null;
  if (isTruthy(ev.is_canceled)) return null;

  // Filter on the FULL cleaned title, then truncate for storage — a relevant keyword past
  // MAX_TITLE_CHARS would otherwise be invisible to the filter.
  const fullTitle = clean(ev.title);
  const title = fullTitle.slice(0, MAX_TITLE_CHARS);
  const url = absoluteHttpUrl(ev.url);
  const startIso = toIsoUtc(ev.date_utc);
  if (!title || !url || !startIso) return null; // NOT NULL columns

  if (source.relevanceFilter && !isSettlementRelevant(fullTitle)) return null;

  const startMs = Date.parse(startIso);
  // The feed only ever looks forward, but bound both edges anyway — an all-day event
  // earlier today is stamped local midnight and is genuinely past by the time we run.
  if (startMs < ctx.nowMs || startMs > ctx.windowEndMs) return null;

  const location = clean(ev.location_title) || clean(ev.location);
  if (!location) return null; // events.location is NOT NULL

  // is_online plus a physical venue is a genuine hybrid — SFU marks those "Virtual and
  // In-Person", which reads as a place name and so never trips isOnlineVenueName.
  const online = isTruthy(ev.is_online);
  const eventType: EventRow['event_type'] = isOnlineVenueName(location)
    ? 'online'
    : online
      ? 'hybrid'
      : 'in-person';

  // An end at or before the start would store an inverted interval; drop it instead.
  const rawEndIso = toIsoUtc(ev.date2_utc);
  const endIso = rawEndIso && Date.parse(rawEndIso) > startMs ? rawEndIso : null;

  return {
    title,
    url,
    startIso,
    endIso,
    description: htmlToParagraphs(ev.description) || null,
    location,
    eventType,
    imageUrl: typeof ev.thumbnail === 'string' && ev.thumbnail ? ev.thumbnail : null,
    hostedBy: clean(ev.group_title) || null,
  };
}

export async function fetchEvents(source: Source, ctx: AdapterContext): Promise<EventRow[]> {
  const url = `https://${source.host}/live/json/events`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });
    if (!res.ok) {
      console.error(`events-crawler: ${source.slug} returned HTTP ${res.status}`);
      return [];
    }
    const data: unknown = await res.json();
    const items: LiveWhaleEvent[] = Array.isArray(data) ? (data as LiveWhaleEvent[]) : [];

    const candidates: Candidate[] = [];
    for (const item of items) {
      const c = toCandidate(item, source, ctx);
      if (c) candidates.push(c);
    }

    // Sort BEFORE deduping so "first seen per url" is the soonest occurrence, not an
    // arbitrary one — see the recurring-events note in the module header.
    candidates.sort((a, b) => (a.startIso < b.startIso ? -1 : a.startIso > b.startIso ? 1 : 0));
    const byUrl = new Map<string, Candidate>();
    for (const c of candidates) {
      if (!byUrl.has(c.url)) byUrl.set(c.url, c);
    }
    const selected = [...byUrl.values()].slice(0, MAX_PER_ORG);

    console.log(
      `events-crawler: ${source.slug} ${items.length} feed items → ${candidates.length} ` +
        `in-window${source.relevanceFilter ? ' + relevant' : ''} → ${byUrl.size} after ` +
        `url-dedupe → taking soonest ${selected.length}`,
    );

    // allSettled so one failed cover lookup can't reject the batch and discard the source.
    const settled = await Promise.allSettled(
      selected.map(async (c): Promise<EventRow> => ({
        title: c.title,
        description: c.description,
        event_datetime: c.startIso,
        event_end_datetime: c.endIso,
        location: c.location,
        event_type: c.eventType,
        cover_photo_url: await resolveCover(c.imageUrl, c.title, c.url, ctx.pexelsCache),
        external_link: c.url,
        hosted_by: c.hostedBy ?? source.name,
        address: null, // LiveWhale ships a single free-text location, no structured address
        genre: genreForEvent(c.title, c.description),
        source: `crawler:${source.slug}`,
      })),
    );
    const rows: EventRow[] = [];
    for (const result of settled) {
      if (result.status === 'fulfilled') rows.push(result.value);
      else console.error(`events-crawler: ${source.slug} row failed:`, result.reason);
    }
    return rows;
  } catch (error) {
    console.error(`events-crawler: failed to fetch ${source.slug}:`, error);
    return [];
  } finally {
    clearTimeout(timer);
  }
}
