// Adapter: Communico "Attend" RSS (North Vancouver District Public Library).
//
// The public calendar is a JavaScript SPA with no server-rendered listing and no JSON API
// we can reach, so RSS is the only readable surface. It is a thin feed and two of its
// limitations shape this adapter:
//
//  1. NO LOCATION FIELD AT ALL. Verified across the whole feed: not one item carries a
//     branch, venue or location element, and the per-event pages are client-rendered
//     behind Cloudflare, so scraping one would need a headless browser. `events.location`
//     is NOT NULL, so the source supplies `defaultLocation` (the library system name).
//     Per-branch scoping is impossible for a second reason too: the `?l=<branch>` filter
//     the site's own UI uses is ignored by the RSS endpoint, which returns the identical
//     system-wide item set regardless. That is why this is NVDPL-wide and not Lynn Valley.
//
//  2. THE EVENT DATETIME IS ONLY IN THE DESCRIPTION. Each body opens with a
//     "Date/Time: Thu, 30 Jul 2026, 10:00am - 11:00am" paragraph and there is no
//     structured date element. `pubDate` is when the listing was published — often months
//     before the event — so it must not be used. The format is uniform: all 100 items
//     parsed cleanly, which is why a single pattern is enough. An item that fails to parse
//     is skipped rather than guessed at.
//
// Times are local wall-clock with no offset, so they go through zonedWallClockToUtc rather
// than being read as UTC (7-8 hours out) or shifted by a hardcoded offset (an hour out for
// half the year).

import { FETCH_TIMEOUT_MS, MAX_PER_ORG, MAX_TITLE_CHARS, ORG_TIMEZONE, USER_AGENT } from '../lib/constants.ts';
import { zonedWallClockToUtc } from '../lib/dates.ts';
import { genreForEvent } from '../lib/genre.ts';
import { resolveCover } from '../lib/images.ts';
import { isSettlementRelevant } from '../lib/relevance.ts';
import { clean, decodeEntities, htmlToParagraphs } from '../lib/text.ts';
import type { AdapterContext, EventRow, Source } from '../lib/types.ts';

const ITEM_RE = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
const TITLE_RE = /<title>([\s\S]*?)<\/title>/i;
const LINK_RE = /<link>([\s\S]*?)<\/link>/i;
const DESCRIPTION_RE = /<description>([\s\S]*?)<\/description>/i;
const MEDIA_RE = /<media:content\b[^>]*\burl="([^"]+)"/i;

/** The whole "Date/Time: …" paragraph, so it can be stripped from the stored body. */
const DATETIME_BLOCK_RE = /<p>\s*<strong>\s*Date\/Time:\s*<\/strong>[\s\S]*?<\/p>/i;
/** Just its text, e.g. "Thu, 30 Jul 2026, 10:00am - 11:00am". */
const DATETIME_TEXT_RE = /Date\/Time:\s*<\/strong>\s*([^<]+)/i;

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

// "Thu, 30 Jul 2026, 10:00am - 11:00am" — the end time is optional, and the separator may
// be a hyphen or an en dash.
const DATETIME_RE =
  /^[A-Za-z]{3,},\s*(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4}),\s*(\d{1,2}):(\d{2})\s*([ap]m)(?:\s*[-–]\s*(\d{1,2}):(\d{2})\s*([ap]m))?/i;

function to24Hour(hour12: number, meridiem: string): number {
  const h = hour12 % 12;
  return meridiem.toLowerCase() === 'pm' ? h + 12 : h;
}

interface ParsedRange {
  startIso: string;
  endIso: string | null;
}

/** Parse the Date/Time text into UTC instants, or null if it doesn't match the format. */
function parseDateTime(text: string, timeZone: string): ParsedRange | null {
  const m = text.trim().match(DATETIME_RE);
  if (!m) return null;

  const day = Number(m[1]);
  const month = MONTHS[m[2].slice(0, 3).toLowerCase()];
  const year = Number(m[3]);
  if (!month) return null;

  const startIso = zonedWallClockToUtc(
    timeZone,
    year,
    month,
    day,
    to24Hour(Number(m[4]), m[6]),
    Number(m[5]),
  );
  if (!startIso) return null;

  let endIso: string | null = null;
  if (m[7] && m[8] && m[9]) {
    endIso = zonedWallClockToUtc(
      timeZone,
      year,
      month,
      day,
      to24Hour(Number(m[7]), m[9]),
      Number(m[8]),
    );
    // An end before the start means the event runs past midnight; the feed gives no end
    // date, so rather than store a negative duration, drop the end time.
    if (endIso && Date.parse(endIso) <= Date.parse(startIso)) endIso = null;
  }
  return { startIso, endIso };
}

function firstGroup(block: string, re: RegExp): string {
  const m = block.match(re);
  return m ? m[1] : '';
}

export async function fetchEvents(source: Source, ctx: AdapterContext): Promise<EventRow[]> {
  const url = `https://${source.host}/rss`;
  const timeZone = ORG_TIMEZONE;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, application/xml' },
    });
    if (!res.ok) {
      console.error(`events-crawler: ${source.slug} returned HTTP ${res.status}`);
      return [];
    }
    const xml = await res.text();

    interface Candidate {
      title: string;
      link: string;
      startIso: string;
      endIso: string | null;
      description: string | null;
      imageUrl: string | null;
    }
    const candidates: Candidate[] = [];
    let unparsedDates = 0;

    ITEM_RE.lastIndex = 0;
    for (const match of xml.matchAll(ITEM_RE)) {
      const block = match[1];
      // Filter on the FULL cleaned title, then truncate for storage — a relevant keyword
      // past MAX_TITLE_CHARS would otherwise be invisible to the filter.
      const fullTitle = clean(firstGroup(block, TITLE_RE));
      const title = fullTitle.slice(0, MAX_TITLE_CHARS);
      const link = clean(firstGroup(block, LINK_RE));
      if (!title || !link) continue;
      if (source.relevanceFilter && !isSettlementRelevant(fullTitle)) continue;

      // Two entity layers: the XML escaping around <description>, then the HTML inside it.
      const descriptionHtml = decodeEntities(firstGroup(block, DESCRIPTION_RE));
      const dateText = firstGroup(descriptionHtml, DATETIME_TEXT_RE);
      const range = dateText ? parseDateTime(decodeEntities(dateText), timeZone) : null;
      if (!range) {
        unparsedDates++;
        continue; // no trustworthy datetime ⇒ skip rather than guess
      }

      const startMs = Date.parse(range.startIso);
      if (startMs < ctx.nowMs || startMs > ctx.windowEndMs) continue;

      // Drop the Date/Time paragraph — it's feed plumbing, and the UI renders the date
      // from event_datetime already.
      const bodyHtml = descriptionHtml.replace(DATETIME_BLOCK_RE, '');

      candidates.push({
        title,
        link,
        startIso: range.startIso,
        endIso: range.endIso,
        description: htmlToParagraphs(bodyHtml) || null,
        imageUrl: firstGroup(block, MEDIA_RE) || null,
      });
    }

    candidates.sort((a, b) => (a.startIso < b.startIso ? -1 : a.startIso > b.startIso ? 1 : 0));
    // Recurring programs repeat as separate items with distinct per-occurrence links, so
    // dedupe by link only guards against the feed listing one twice.
    const byLink = new Map<string, Candidate>();
    for (const c of candidates) {
      if (!byLink.has(c.link)) byLink.set(c.link, c);
    }
    const selected = [...byLink.values()].slice(0, MAX_PER_ORG);

    console.log(
      `events-crawler: ${source.slug} ${candidates.length} in-window` +
        `${source.relevanceFilter ? ' + relevant' : ''}, ${unparsedDates} unparsable date(s), ` +
        `taking soonest ${selected.length}`,
    );

    // allSettled so one failed cover lookup can't reject the batch and discard the source.
    const settled = await Promise.allSettled(
      selected.map(async (c): Promise<EventRow> => ({
        title: c.title,
        description: c.description,
        event_datetime: c.startIso,
        event_end_datetime: c.endIso,
        location: source.defaultLocation ?? source.name,
        // The feed carries no online/virtual signal whatsoever, and the default location
        // is a physical library system, so claiming anything else would be invention.
        event_type: 'in-person',
        cover_photo_url: await resolveCover(c.imageUrl, c.title, c.link, ctx.pexelsCache),
        external_link: c.link,
        hosted_by: source.name,
        address: null,
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
