// Adapter: WordPress "The Events Calendar" (Tribe) JSON REST API.
//
// Serves every Phase-1 settlement org plus West Vancouver Memorial Library. Extracted
// verbatim from the pre-adapter crawler — behaviour is unchanged apart from the shared
// relevance filter, which only applies to sources that opt in.

import {
  FETCH_TIMEOUT_MS,
  MAX_PER_ORG,
  MAX_TITLE_CHARS,
  USER_AGENT,
} from '../lib/constants.ts';
import { toIsoUtc } from '../lib/dates.ts';
import { genreForEvent } from '../lib/genre.ts';
import { resolveCover } from '../lib/images.ts';
import { isSettlementRelevant } from '../lib/relevance.ts';
import { clean, htmlToParagraphs, isOnlineVenueName } from '../lib/text.ts';
import type { AdapterContext, EventRow, Source } from '../lib/types.ts';

interface TribeVenue {
  venue?: string;
  address?: string;
  city?: string;
  stateprovince?: string;
  province?: string;
  zip?: string;
}

interface TribeEvent {
  status?: string;
  hide_from_listings?: boolean;
  title?: string;
  url?: string;
  utc_start_date?: string;
  utc_end_date?: string;
  excerpt?: string;
  description?: string;
  /** Tribe sends `[]` rather than null when an event has no venue. */
  venue?: TribeVenue | TribeVenue[] | null;
  is_virtual?: boolean;
  image?: { url?: string } | null;
  organizer?: unknown;
}

function organizerName(organizer: unknown): string | null {
  if (!Array.isArray(organizer) || organizer.length === 0) return null;
  const first: unknown = organizer[0];
  if (typeof first === 'string') return clean(first) || null;
  if (first && typeof first === 'object' && 'organizer' in first) {
    const value = (first as { organizer?: unknown }).organizer;
    if (typeof value === 'string') return clean(value) || null;
  }
  return null;
}

/**
 * Map one Tribe REST event to an EventRow, or null when it can't be shaped into a valid
 * row (missing NOT-NULL data, undeterminable location, past, hidden, filtered out, or
 * starting beyond the rolling window).
 */
async function tribeEventToRow(
  ev: TribeEvent | null,
  source: Source,
  ctx: AdapterContext,
): Promise<EventRow | null> {
  if (!ev || typeof ev !== 'object') return null;
  if (ev.status && ev.status !== 'publish') return null;
  if (ev.hide_from_listings === true) return null;

  // Filter on the FULL cleaned title, then truncate for storage — a relevant keyword
  // sitting past MAX_TITLE_CHARS would otherwise be invisible to the filter and the event
  // silently dropped.
  const fullTitle = clean(ev.title);
  const title = fullTitle.slice(0, MAX_TITLE_CHARS);
  const externalLink = typeof ev.url === 'string' ? ev.url.trim() : '';
  const eventDatetime = toIsoUtc(ev.utc_start_date);
  if (!title || !externalLink || !eventDatetime) return null; // NOT NULL columns

  // Cheap rejections first, so a filtered or far-future event costs no HEAD probe or
  // Pexels lookup. Backstop for the server-side ?end_date — see fetchEvents.
  if (source.relevanceFilter && !isSettlementRelevant(fullTitle)) return null;
  if (Date.parse(eventDatetime) > ctx.windowEndMs) return null;

  // location + event_type from the venue NAME first, then venue presence, then the
  // virtual flag — see isOnlineVenueName for why the name has to win.
  const rawVenue = ev.venue;
  const venue =
    rawVenue && typeof rawVenue === 'object' && !Array.isArray(rawVenue) ? rawVenue : null;
  const venueName = venue ? clean(venue.venue) : '';
  const hasVenue = venueName.length > 0;
  const isVirtual = ev.is_virtual === true;

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
    venue && clean(venue.address)
      ? [venue.address, venue.city, venue.stateprovince || venue.province, venue.zip]
          .map((p) => clean(p))
          .filter(Boolean)
          .join(', ')
      : null;

  const imageUrl = ev.image && typeof ev.image.url === 'string' ? ev.image.url : null;

  return {
    title,
    description,
    event_datetime: eventDatetime,
    event_end_datetime: toIsoUtc(ev.utc_end_date),
    location,
    event_type: eventType,
    cover_photo_url: await resolveCover(imageUrl, title, externalLink, ctx.pexelsCache),
    external_link: externalLink,
    hosted_by: organizerName(ev.organizer) ?? source.name,
    address,
    genre: genreForEvent(title, description),
    source: `crawler:${source.slug}`,
  };
}

export async function fetchEvents(
  source: Source,
  ctx: AdapterContext,
): Promise<EventRow[]> {
  // ?end_date is a server-side bound; tribeEventToRow re-checks per row because a source
  // whose API ignores the param would otherwise slip events years out past it.
  const url =
    `https://${source.host}/wp-json/tribe/events/v1/events` +
    `?per_page=${MAX_PER_ORG}&start_date=${ctx.today}%2000:00:00` +
    `&end_date=${ctx.windowEnd}%2023:59:59`;

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
    const events: TribeEvent[] =
      data && typeof data === 'object' && Array.isArray((data as { events?: unknown }).events)
        ? ((data as { events: TribeEvent[] }).events)
        : [];
    // allSettled, not all: tribeEventToRow awaits network work (the cover HEAD probe and
    // the Pexels lookup). With Promise.all a single rejection would reject the whole
    // batch, hit the outer catch and return [] — one transient image failure discarding
    // every event of this source for the entire weekly run.
    const settled = await Promise.allSettled(
      events.slice(0, MAX_PER_ORG).map((ev) => tribeEventToRow(ev, source, ctx)),
    );
    const kept: EventRow[] = [];
    for (const result of settled) {
      if (result.status === 'fulfilled') {
        if (result.value) kept.push(result.value);
      } else {
        console.error(`events-crawler: ${source.slug} row failed:`, result.reason);
      }
    }
    if (source.relevanceFilter) {
      console.log(
        `events-crawler: ${source.slug} relevance filter kept ${kept.length} of ${events.length} fetched`,
      );
    }
    return kept;
  } catch (error) {
    console.error(`events-crawler: failed to fetch ${source.slug}:`, error);
    return [];
  } finally {
    clearTimeout(timer);
  }
}
