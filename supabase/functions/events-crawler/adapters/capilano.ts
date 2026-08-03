// Adapter: Capilano University (Terminalfour CMS, server-rendered HTML).
//
// Deferred from the 2026-07-29 round on the belief its listing carried no dates and would
// need a fetch per event. Re-checked 2026-08-02: not so. Each `li.event-item` carries the
// month, day, optional end date, optional times, venue, link and image inline, so there is
// no N+1.
//
// ONE PAGE ONLY, AND THAT IS A ROBOTS DECISION, NOT AN OVERSIGHT.
// capilanou.ca/robots.txt has a `User-agent: *` block disallowing `/*?search=*` and
// `/*&search=*`, and every calendar-navigation URL the page offers is of the form
// `?day=14&month=08&year=2026&search=day`. So the paginated/month views are off-limits to
// us and this adapter reads only the unparameterized listing. The practical ceiling is
// about ten upcoming items — do not "fix" a low count by adding query parameters.
//
// Expect a very low yield, and that is correct rather than broken. The listing is mostly
// the academic administrative calendar — fee deadlines, grade-submission dates, campus
// closures — which `relevanceFilter` is right to drop. Measured 2026-08-02: 1 of 10 items
// passed, "Fall 2026 New International Student Orientation", caught by relevance.ts's
// `international student` term. One genuinely on-mission event is the realistic yield here.
//
// MOST ITEMS HAVE NO TIME. 8 of those 10 are all-day administrative entries with no
// `datelisting` span at all — including the one relevant event. `events.event_datetime` is
// NOT NULL, so those are stored at ALL_DAY_HOUR local. That asserts an hour the source does
// not state, which is a real if small cost; the alternative is dropping every all-day item,
// which would have dropped the only event worth having.
//
// NO WEEKDAY, so the year cannot be resolved the way adapters/nvcl.ts does it. The listing
// is chronological instead, so the year is carried forward monotonically: start on the
// org's current year and roll to the next as soon as a month/day goes backwards relative to
// the previous row. That is what keeps a December-to-January listing from filing January in
// the past.

import { FETCH_TIMEOUT_MS, MAX_PER_ORG, MAX_TITLE_CHARS, ORG_TIMEZONE, USER_AGENT } from '../lib/constants.ts';
import { zonedWallClockToUtc } from '../lib/dates.ts';
import { genreForEvent } from '../lib/genre.ts';
import { resolveCover } from '../lib/images.ts';
import { isSettlementRelevant } from '../lib/relevance.ts';
import { clean, isOnlineVenueName } from '../lib/text.ts';
import type { AdapterContext, EventRow, Source } from '../lib/types.ts';

/** Opens each event row in the listing. */
const BLOCK_MARKER = '<li class="event-item">';
/** Start stamp. `date-stamp2`, when present, is the end of a multi-day event. */
const START_STAMP_RE =
  /<div class="date-stamp[^"]*">\s*<div class="month">\s*([A-Za-z]+)\s*<\/div>\s*<div class="day">\s*(\d{1,2})\s*<\/div>/i;
const END_STAMP_RE =
  /<div class="date-stamp2">\s*<div class="month">\s*([A-Za-z]+)\s*<\/div>\s*<div class="day">\s*(\d{1,2})\s*<\/div>/i;
const TITLE_LINK_RE = /<p class="title">\s*<a href="([^"]+)"[^>]*>\s*([\s\S]*?)<\/a>/i;
/** Start time, and optionally an end time, e.g. "7:30 PM" - "9:30 PM". Absent on all-day items. */
const TIMES_RE =
  /<span class="datelisting">\s*([^<]*?)\s*<\/span>(?:\s*-\s*<span class="datelisting">\s*([^<]*?)\s*<\/span>)?/i;
/** Venue text sits in the anchor after the location icon, prefixed "Venues>". */
const VENUE_RE = /fa-location-arrow[\s\S]{0,160}?<a[^>]*>([\s\S]*?)<\/a>/i;
const VENUE_PREFIX_RE = /^Venues\s*>\s*/i;
const IMAGE_RE = /<img\s+src="([^"]+)"[^>]*class="event-image"/i;

const TIME_RE = /^(\d{1,2}):(\d{2})\s*([ap]\.?m\.?)$/i;

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * Local hour used for all-day items, which are the majority here. 09:00 rather than
 * midnight: the row renders as a time in the UI, and "9:00 AM" reads as a business-day
 * event where "12:00 AM" reads as a bug.
 */
const ALL_DAY_HOUR = 9;

function to24Hour(hour12: number, meridiem: string): number {
  const h = hour12 % 12;
  return meridiem.toLowerCase().startsWith('p') ? h + 12 : h;
}

/** "7:30 PM" → {hour, minute}, or null when the string isn't a time. */
function parseTime(value: string | undefined): { hour: number; minute: number } | null {
  if (!value) return null;
  const m = value.trim().match(TIME_RE);
  if (!m) return null;
  return { hour: to24Hour(Number(m[1]), m[3]), minute: Number(m[2]) };
}

/** Per-layer tally of blocks the parse could not read at all. */
interface StructuralMisses {
  /** No title anchor, or an anchor with an empty title. */
  title: number;
  /** Title found, but no start date stamp, or an unknown month name. */
  stamp: number;
}

interface Candidate {
  title: string;
  link: string;
  startIso: string;
  endIso: string | null;
  location: string;
  imageUrl: string | null;
}

interface PageParse {
  candidates: Candidate[];
  /** Blocks seen, before any filtering — 0 means the markup marker stopped matching. */
  blocks: number;
  /**
   * Structural rejections, split by layer. Deliberately excludes the relevance and window
   * filters: those reject on merit, and dropping most of an academic calendar is their job,
   * so counting them would make the page-level diagnostic fire on every healthy run.
   */
  misses: StructuralMisses;
}

async function fetchListing(source: Source): Promise<string | null> {
  // No query string, by robots policy — see the header.
  const url = `https://${source.host}/about-capu/get-to-know-us/events/`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
    });
    if (!res.ok) {
      console.error(`events-crawler: ${source.slug} listing returned HTTP ${res.status}`);
      return null;
    }
    return await res.text();
  } catch (error) {
    console.error(`events-crawler: ${source.slug} listing failed:`, error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function parseListing(html: string, source: Source, ctx: AdapterContext): PageParse {
  const chunks = html.split(BLOCK_MARKER).slice(1);
  const candidates: Candidate[] = [];
  const misses: StructuralMisses = { title: 0, stamp: 0 };

  // Year carried forward across the chronological listing — see the header.
  let year = Number(
    new Intl.DateTimeFormat('en-CA', { timeZone: ORG_TIMEZONE, year: 'numeric' })
      .format(new Date(ctx.nowMs)),
  );
  let prevMonth = 0;
  let prevDay = 0;

  for (const chunk of chunks) {
    const titleMatch = chunk.match(TITLE_LINK_RE);
    if (!titleMatch) {
      misses.title++;
      continue;
    }
    const href = titleMatch[1];
    // Filter on the FULL cleaned title, then truncate for storage.
    const fullTitle = clean(titleMatch[2]);
    if (!fullTitle) {
      misses.title++;
      continue;
    }

    const startStamp = chunk.match(START_STAMP_RE);
    const month = startStamp ? MONTHS[startStamp[1].slice(0, 3).toLowerCase()] : undefined;
    if (!startStamp || !month) {
      misses.stamp++;
      continue;
    }
    const day = Number(startStamp[2]);

    // Roll the year forward the moment the listing wraps past December.
    if (prevMonth && (month < prevMonth || (month === prevMonth && day < prevDay))) year++;
    prevMonth = month;
    prevDay = day;

    const startTime = parseTime(chunk.match(TIMES_RE)?.[1]);
    const startIso = zonedWallClockToUtc(
      ORG_TIMEZONE,
      year,
      month,
      day,
      startTime?.hour ?? ALL_DAY_HOUR,
      startTime?.minute ?? 0,
    );
    if (!startIso) {
      // Not a real date on the calendar — a malformed stamp, not a filtered row.
      misses.stamp++;
      continue;
    }
    const startMs = Date.parse(startIso);

    // Window before relevance, so both filters see every parsed row.
    if (source.relevanceFilter && !isSettlementRelevant(fullTitle)) continue;
    if (startMs < ctx.nowMs || startMs > ctx.windowEndMs) continue;

    // End date and end time are independent: a multi-day item has date-stamp2 but often no
    // times, and a single-day concert has an end time but no second stamp.
    const endStamp = chunk.match(END_STAMP_RE);
    const endMonth = endStamp ? MONTHS[endStamp[1].slice(0, 3).toLowerCase()] : undefined;
    const endTime = parseTime(chunk.match(TIMES_RE)?.[2]);
    let endIso: string | null = null;
    if (endStamp && endMonth) {
      // A multi-day range that wraps the year end lands in the following year.
      const endYear = endMonth < month ? year + 1 : year;
      endIso = zonedWallClockToUtc(
        ORG_TIMEZONE,
        endYear,
        endMonth,
        Number(endStamp[2]),
        endTime?.hour ?? ALL_DAY_HOUR,
        endTime?.minute ?? 0,
      );
    } else if (endTime) {
      endIso = zonedWallClockToUtc(ORG_TIMEZONE, year, month, day, endTime.hour, endTime.minute);
    }
    // Never store an inverted range; the listing gives no signal for a past-midnight end.
    if (endIso && Date.parse(endIso) <= startMs) endIso = null;

    const venueMatch = chunk.match(VENUE_RE);
    const location = clean(venueMatch?.[1]).replace(VENUE_PREFIX_RE, '').trim();
    if (!location) continue; // events.location is NOT NULL

    const imageMatch = chunk.match(IMAGE_RE);
    const rawImage = imageMatch?.[1];

    candidates.push({
      title: fullTitle.slice(0, MAX_TITLE_CHARS),
      link: href.startsWith('http') ? href : `https://${source.host}${href}`,
      startIso,
      endIso,
      location,
      imageUrl: rawImage
        ? (rawImage.startsWith('http') ? rawImage : `https://${source.host}${rawImage}`)
        : null,
    });
  }

  return { candidates, blocks: chunks.length, misses };
}

export async function fetchEvents(source: Source, ctx: AdapterContext): Promise<EventRow[]> {
  const html = await fetchListing(source);
  if (html === null) return [];

  const parsed = parseListing(html, source, ctx);

  if (parsed.blocks === 0) {
    console.error(
      `events-crawler: ${source.slug} found no "${BLOCK_MARKER}" blocks — the listing markup ` +
        `has probably changed`,
    );
    return [];
  }
  // Blocks present but none survived extraction: the marker still matches while the title
  // anchor or the date stamp moved. A source that returns nothing because its markup shifted
  // otherwise looks exactly like a university with nothing on.
  const structural = parsed.misses.title + parsed.misses.stamp;
  if (structural === parsed.blocks) {
    console.error(
      `events-crawler: ${source.slug} matched ${parsed.blocks} block(s) but extracted none of ` +
        `them (title ${parsed.misses.title}, date stamp ${parsed.misses.stamp}) — the row ` +
        `markup has probably changed`,
    );
  }

  // Dedupe by link. Defensive here rather than load-bearing: this listing showed 10 distinct
  // links in 10 blocks, with no repeated featured section of the kind adapters/nvcl.ts has to
  // handle. Kept so a future recurring-event grouping cannot produce a duplicate-key insert.
  const byLink = new Map<string, Candidate>();
  for (const c of parsed.candidates) {
    if (!byLink.has(c.link)) byLink.set(c.link, c);
  }
  const deduped = [...byLink.values()];
  deduped.sort((a, b) => a.startIso.localeCompare(b.startIso));
  const selected = deduped.slice(0, MAX_PER_ORG);

  console.log(
    `events-crawler: ${source.slug} parsed ${parsed.blocks} block(s), ` +
      `${parsed.candidates.length} in-window + relevant (${deduped.length} unique), ` +
      `taking soonest ${selected.length}`,
  );

  // allSettled so one failed cover lookup can't reject the batch and discard the source.
  const settled = await Promise.allSettled(
    selected.map(async (c): Promise<EventRow> => ({
      title: c.title,
      description: null, // the listing carries no summary; the detail page is a separate fetch
      event_datetime: c.startIso,
      event_end_datetime: c.endIso,
      location: c.location,
      event_type: isOnlineVenueName(c.location) ? 'online' : 'in-person',
      cover_photo_url: await resolveCover(c.imageUrl, c.title, c.link, ctx.pexelsCache),
      external_link: c.link,
      hosted_by: source.name,
      address: null,
      genre: genreForEvent(c.title, null),
      source: `crawler:${source.slug}`,
    })),
  );
  const rows: EventRow[] = [];
  for (const result of settled) {
    if (result.status === 'fulfilled') rows.push(result.value);
    else console.error(`events-crawler: ${source.slug} row failed:`, result.reason);
  }
  return rows;
}
