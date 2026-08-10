// Adapter: North Vancouver City Library (Drupal, server-rendered HTML).
//
// The second HTML-scraping adapter, and the second library whose BiblioCommons tenant is a
// dead end. `nvcl` on BiblioCommons *is* North Vancouver City Library — the identity is
// right, unlike the `bpl`/Boston trap documented in adapters/bibliocommons.ts — but the
// gateway answers 403 "The Events feature is not available at North Vancouver City
// Library", exactly as Burnaby's does. Verified before writing this, so the next person
// doesn't re-test it. The Drupal listing is the only readable surface.
//
// It earns the scraping cost: NVCL runs settlement-adjacent programming (conversation
// circles, newcomer drop-ins, the Open Door community hub) alongside the usual storytimes,
// which is what `relevanceFilter` is for.
//
// THE LISTING CARRIES NO YEAR. Every row reads "Tuesday, August 4, 10:30 am to 11:00 am" —
// weekday, month, day, times, and nothing else (verified: 0 of 45 sampled rows across three
// pages carried a year). That matters more than it looks, because the paginated list runs
// chronologically straight past the year boundary: page 37 of 38 lists April-June, i.e. the
// *following* year. Guessing "current year" would file those ~8 months in the past.
//
// So the year is *derived and then checked*, not assumed: for each candidate year the
// weekday of the resulting date is compared against the weekday the page printed, and the
// candidate that matches wins. A row whose weekday matches neither candidate is skipped
// rather than guessed at — a wrong date is worse than a missing event.
//
// NO LOCATION FIELD. The slot exists in the markup (a second <p class="font-weight-bold">)
// but is empty on every row sampled, so the source supplies `defaultLocation`. Titles
// routinely name the venue anyway ("Outdoor storytime at Semisch Park", "Book Bike at
// MONOVA"), so the specific place is not lost, just not machine-readable.
//
// NO IMAGES either — the listing renders an icon font per event, not a photo, so covers
// always fall through to the Pexels/Unsplash tiers.
//
// Pagination is `?page=N`, 0-based and chronological, so the walk can stop once a page runs
// past the window. Every page additionally repeats the same five "featured" rows before its
// paginated section, which is why dedupe-by-link is load-bearing rather than defensive:
// without it a 20-page walk would return the same five events 20 times.

import { FETCH_TIMEOUT_MS, MAX_PER_ORG, MAX_TITLE_CHARS, ORG_TIMEZONE, USER_AGENT } from '../lib/constants.ts';
import { zonedWallClockToUtc } from '../lib/dates.ts';
import { genreForEvent } from '../lib/genre.ts';
import { resolveCover } from '../lib/images.ts';
import { isSettlementRelevant } from '../lib/relevance.ts';
import { clean, isOnlineVenueName } from '../lib/text.ts';
import type { AdapterContext, EventRow, Source } from '../lib/types.ts';

/** Opens each event row in the Drupal listing. */
const BLOCK_MARKER = '<div class="eventinstance-list';
const TITLE_LINK_RE = /<a\s+href="(\/events\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/i;
/** The first bold paragraph in the block is the when-line; the second is the empty venue slot. */
const WHEN_RE = /<p class="font-weight-bold">\s*([\s\S]*?)<\/p>/i;

// "Tuesday, August 4, 10:30 am to 11:00 am" — the end time is optional.
const WHEN_PARSE_RE =
  /^([A-Za-z]+),\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{1,2}):(\d{2})\s*([ap]m)(?:\s*to\s*(\d{1,2}):(\d{2})\s*([ap]m))?/i;

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const WEEKDAYS: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

/** Pages fetched per round before the stop conditions are re-checked. */
const PAGE_CONCURRENCY = 4;
/**
 * Hard bound on pages walked. The pager advertises 38 pages of 15; the 4-month window is
 * reached well before that, so this is a backstop for a listing that grows or stops being
 * chronological, not the expected exit. Hitting it is logged, never silent.
 */
const MAX_PAGES = 24;

function to24Hour(hour12: number, meridiem: string): number {
  const h = hour12 % 12;
  return meridiem.toLowerCase() === 'pm' ? h + 12 : h;
}

/** The weekday of a Y-M-D as rendered on the org's calendar, 0=Sunday. */
function weekdayInTimezone(timeZone: string, iso: string): number | null {
  const name = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' })
    .format(new Date(iso))
    .slice(0, 3)
    .toLowerCase();
  const day = WEEKDAYS[name];
  return day === undefined ? null : day;
}

interface ParsedWhen {
  startIso: string;
  endIso: string | null;
}

/**
 * Parse the when-line into UTC instants, resolving the missing year against the printed
 * weekday. Returns null when the line doesn't match, the month is unknown, or no candidate
 * year reproduces the weekday the page printed.
 */
function parseWhen(text: string, timeZone: string, nowMs: number): ParsedWhen | null {
  const m = text.trim().match(WHEN_PARSE_RE);
  if (!m) return null;

  const month = MONTHS[m[2].slice(0, 3).toLowerCase()];
  const printedWeekday = WEEKDAYS[m[1].slice(0, 3).toLowerCase()];
  if (!month || printedWeekday === undefined) return null;

  const day = Number(m[3]);
  const startHour = to24Hour(Number(m[4]), m[6]);
  const startMinute = Number(m[5]);

  // The listing only ever runs forwards from today, so the year is either the current one
  // on the org's calendar or the next. Try both and keep the one whose weekday matches what
  // the page printed — that is what disambiguates a page-37 "April 15" from this April.
  const currentYear = Number(
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric' }).format(new Date(nowMs)),
  );
  for (const year of [currentYear, currentYear + 1]) {
    const startIso = zonedWallClockToUtc(timeZone, year, month, day, startHour, startMinute);
    if (!startIso) continue; // not a real date on the calendar (e.g. Feb 30)
    if (weekdayInTimezone(timeZone, startIso) !== printedWeekday) continue;

    let endIso: string | null = null;
    if (m[7]) {
      const endHour = to24Hour(Number(m[7]), m[9]);
      const candidate = zonedWallClockToUtc(timeZone, year, month, day, endHour, Number(m[8]));
      // An end before the start means the event runs past midnight; the listing gives no
      // end date to confirm that, so drop the end rather than store an inverted range.
      if (candidate && Date.parse(candidate) > Date.parse(startIso)) endIso = candidate;
    }
    return { startIso, endIso };
  }
  return null;
}

async function fetchPage(source: Source, page: number): Promise<string | null> {
  const url = `https://${source.host}/events?page=${page}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
    });
    if (!res.ok) {
      console.error(`events-crawler: ${source.slug} page ${page} returned HTTP ${res.status}`);
      return null;
    }
    return await res.text();
  } catch (error) {
    console.error(`events-crawler: ${source.slug} page ${page} failed:`, error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

interface Candidate {
  title: string;
  link: string;
  startIso: string;
  endIso: string | null;
}

/** Per-layer tally of blocks the parse could not read at all. */
interface StructuralMisses {
  /** No `/events/` anchor, or an anchor with an empty title. */
  title: number;
  /** Anchor found, but no bold when-line paragraph in the block. */
  when: number;
  /** When-line found, but it did not parse as a date (format or weekday change). */
  date: number;
}

interface PageParse {
  candidates: Candidate[];
  /** Blocks seen, before any filtering — 0 means the listing has run out. */
  blocks: number;
  /**
   * Blocks rejected for STRUCTURAL reasons — the markup or the date format moved — as
   * opposed to the relevance and window filters, which reject on merit and are expected to
   * reject most of a library calendar.
   *
   * Split by layer because each fails independently and the fix differs: the block marker
   * can still match while the anchor moves, the anchor can match while the bold-paragraph
   * when-line is renamed, and both can match while the date string changes shape (dropping
   * the weekday would defeat the parse on its own). Counting only the first layer would
   * leave the other two silent, which is the failure mode this whole set exists to prevent.
   */
  misses: StructuralMisses;
  /**
   * Start of the LAST block on the page, in document order — the stop signal.
   *
   * Deliberately not the maximum. Each page is "five featured rows, then the chronological
   * section", and the featured rows are curated, so one of them can sit arbitrarily far
   * out (a save-the-date). A page maximum would then exceed the window on page 0 and
   * truncate the walk after the first batch, silently dropping in-window listings — and
   * because the featured block repeats on EVERY page, requiring a whole batch to agree
   * wouldn't help either; every page would report the same distant maximum.
   *
   * The last block always belongs to the chronological section, so its start is the
   * furthest-out entry the paginated list has actually reached. That is the thing the walk
   * wants to compare against the window, and it needs no guess about how many featured
   * rows there are.
   */
  lastStartMs: number;
}

function parsePage(html: string, source: Source, ctx: AdapterContext): PageParse {
  const chunks = html.split(BLOCK_MARKER).slice(1);
  const candidates: Candidate[] = [];
  let lastStartMs = 0;
  const misses: StructuralMisses = { title: 0, when: 0, date: 0 };

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

    const whenMatch = chunk.match(WHEN_RE);
    if (!whenMatch) {
      misses.when++;
      continue;
    }
    const parsed = parseWhen(clean(whenMatch[1]), ORG_TIMEZONE, ctx.nowMs);
    if (!parsed) {
      misses.date++;
      continue;
    }

    const startMs = Date.parse(parsed.startIso);
    lastStartMs = startMs;

    // Track the window before relevance, so the walk can stop on dates even when a page
    // happens to contain nothing relevant.
    if (source.relevanceFilter && !isSettlementRelevant(fullTitle, { strict: source.strictRelevance })) continue;
    if (startMs < ctx.nowMs || startMs > ctx.windowEndMs) continue;

    candidates.push({
      title: fullTitle.slice(0, MAX_TITLE_CHARS),
      link: `https://${source.host}${href}`,
      startIso: parsed.startIso,
      endIso: parsed.endIso,
    });
  }

  return { candidates, blocks: chunks.length, misses, lastStartMs };
}

export async function fetchEvents(source: Source, ctx: AdapterContext): Promise<EventRow[]> {
  // events.location is NOT NULL and this feed has no location field at all, so a source
  // without defaultLocation would produce rows that cannot be inserted. Fail loudly here
  // rather than at the insert.
  const location = source.defaultLocation;
  if (!location) {
    console.error(
      `events-crawler: ${source.slug} has no defaultLocation, but its listing carries no ` +
        `location field — skipping the source rather than inserting a wrong place.`,
    );
    return [];
  }

  // Deduped as the walk goes, not afterwards, because the early-stop counts against it.
  // Every page repeats the same five featured rows above its paginated section, so a raw
  // running total counts those once per page: with the relevance filter on — the shipped
  // configuration — a source whose only relevant rows are featured ones would reach
  // MAX_PER_ORG in raw count while holding a handful of distinct events, stop, and return
  // that handful while in-window listings remained unread. Counting distinct links makes
  // the stop condition mean what it says.
  const byLink = new Map<string, Candidate>();
  let seenCandidates = 0;
  let pagesWalked = 0;
  let stoppedEarly = false;
  let exhausted = false;

  for (let page = 0; page < MAX_PAGES; page += PAGE_CONCURRENCY) {
    const batch: number[] = [];
    for (let p = page; p < Math.min(page + PAGE_CONCURRENCY, MAX_PAGES); p++) batch.push(p);
    const pages = await Promise.all(batch.map((p) => fetchPage(source, p)));

    let pastWindow = false;
    for (const html of pages) {
      pagesWalked++;
      if (html === null) continue;
      const parsed = parsePage(html, source, ctx);
      if (parsed.blocks === 0) {
        // Either the listing ran out, or the markup changed under us. Page 0 is never
        // legitimately empty for a live listing, so that case is a parse failure and is
        // logged as one.
        if (pagesWalked === 1) {
          console.error(
            `events-crawler: ${source.slug} found no "${BLOCK_MARKER}" blocks on page 0 — ` +
              `the listing markup has probably changed`,
          );
        }
        exhausted = true;
        continue;
      }
      // Blocks present, but not one of them survived extraction. The marker still matches
      // while something inside it moved — the anchor, the when-line, or the date format.
      // Checked across all three layers rather than the title alone: each fails
      // independently, and a source that returns zero rows because its date strings changed
      // shape looks exactly like a library with nothing on. The relevance and window filters
      // are deliberately NOT counted here — they reject on merit, and rejecting most of a
      // library calendar is their job, so folding them in would make this fire constantly.
      const structural = parsed.misses.title + parsed.misses.when + parsed.misses.date;
      if (pagesWalked === 1 && structural === parsed.blocks) {
        console.error(
          `events-crawler: ${source.slug} matched ${parsed.blocks} block(s) on page 0 but ` +
            `extracted none of them (title ${parsed.misses.title}, when-line ` +
            `${parsed.misses.when}, date ${parsed.misses.date}) — the row markup or the ` +
            `date format has probably changed`,
        );
      }
      for (const c of parsed.candidates) {
        seenCandidates++;
        // First occurrence wins: the featured copy and the chronological copy of the same
        // event carry the same date, so either is correct and keeping the earlier one is
        // stable across runs.
        if (!byLink.has(c.link)) byLink.set(c.link, c);
      }
      if (parsed.lastStartMs > ctx.windowEndMs) pastWindow = true;
    }

    if (exhausted || pastWindow || byLink.size >= MAX_PER_ORG) {
      stoppedEarly = true;
      break;
    }
  }

  if (!stoppedEarly && pagesWalked >= MAX_PAGES) {
    console.warn(
      `events-crawler: ${source.slug} stopped at the ${MAX_PAGES}-page cap with ` +
        `${byLink.size} unique candidate(s) — listings beyond it are the furthest out and ` +
        `will be picked up on a later run.`,
    );
  }

  // Already deduped by link during the walk (see byLink above). Link is safe as the
  // identity: across 45 sampled rows no slug appeared with two different dates, so the slug
  // identifies the occurrence and matches the events_external_link_key unique index.
  const deduped = [...byLink.values()];
  deduped.sort((a, b) => a.startIso.localeCompare(b.startIso));
  const selected = deduped.slice(0, MAX_PER_ORG);

  console.log(
    `events-crawler: ${source.slug} walked ${pagesWalked} page(s), ${seenCandidates} ` +
      `in-window + relevant (${deduped.length} unique), taking soonest ${selected.length}`,
  );

  // allSettled so one failed cover lookup can't reject the batch and discard the source.
  const settled = await Promise.allSettled(
    selected.map(async (c): Promise<EventRow> => ({
      title: c.title,
      description: null, // the listing carries no summary; the detail page is a separate fetch
      event_datetime: c.startIso,
      event_end_datetime: c.endIso,
      location,
      event_type: isOnlineVenueName(location) ? 'online' : 'in-person',
      // The listing renders an icon font rather than a photo, so this always falls through
      // to the Pexels topic photo and then the deterministic Unsplash pool.
      cover_photo_url: await resolveCover(null, c.title, c.link, ctx.pexelsCache),
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
