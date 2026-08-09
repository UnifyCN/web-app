// Adapter: Surrey Libraries (Drupal, server-rendered HTML).
//
// The only HTML-scraping adapter. Surrey publishes no RSS, no ICS and no JSON, and its
// BiblioCommons tenant has the Events feature disabled — but the listing at
// /events?page=N is fully server-rendered, so no headless browser is needed.
//
// It earns the scraping cost: this is the most settlement-relevant of the Phase-2 library
// sources, carrying "Settlement Services for Newcomers", "WorkBC Résumé Clinic" and
// "Practice Speaking English" alongside the usual storytimes.
//
// Datetimes come from the `<time datetime="…">` attribute, NOT the `eventdate` query
// parameter. Both encode the same instant, but the attribute is a full ISO-8601 timestamp
// carrying its own offset ("2026-07-31T10:00:00-07:00"), so it needs no timezone
// reconstruction and is DST-correct by construction; `eventdate` is a bare local
// "YYYY-MM-DD HH:MM:SS". Each row carries two <time> elements — start and end.
//
// `eventdate` IS kept in external_link, because it is what makes each occurrence of a
// recurring program distinct under the events_external_link_key unique index.
//
// Pagination is 0-based and chronological, so pages can be walked from today and stopped
// early. The relevance filter keeps roughly a fifth of listings, so reaching MAX_PER_ORG
// would take on the order of a hundred pages; MAX_PAGES caps that far lower and logs when
// it bites. That is an acceptable bound rather than a silent one: the cron runs weekly and
// the listing is chronological, so the events just beyond the cap are the furthest out and
// get picked up on a later run as the horizon advances.

import { FETCH_TIMEOUT_MS, MAX_PER_ORG, MAX_TITLE_CHARS, USER_AGENT } from '../lib/constants.ts';
import { offsetIsoToUtc } from '../lib/dates.ts';
import { genreForEvent } from '../lib/genre.ts';
import { resolveCover } from '../lib/images.ts';
import { isSettlementRelevant } from '../lib/relevance.ts';
import { clean, isOnlineVenueName } from '../lib/text.ts';
import type { AdapterContext, EventRow, Source } from '../lib/types.ts';

/** Opens each event row in the Drupal listing. */
const BLOCK_MARKER = '<div class="pattern pattern-event-info-item event-info-item">';
const TITLE_LINK_RE = /<a\s+href="(\/events\/[^"]+)"[^>]*>\s*<h3>([\s\S]*?)<\/h3>/i;
const TIME_RE = /<time\s+datetime="([^"]+)"/gi;
const LOCATION_RE =
  /views-field-field-address[\s\S]{0,400}?<div class="field-content">([\s\S]*?)<\/div>/i;

/** Pages fetched per round before the stop conditions are re-checked. */
const PAGE_CONCURRENCY = 4;
/**
 * Hard bound on pages walked. 10 listings per page and a ~20% relevance keep-rate means
 * MAX_PER_ORG would otherwise need ~125 requests. Hitting this is logged, never silent.
 */
const MAX_PAGES = 20;

/** Per-layer tally of blocks the parse could not read at all. */
interface StructuralMisses {
  /** No title anchor, or an anchor with an empty <h3>. */
  title: number;
  /** Title found, but no <time datetime> attribute, or one that would not parse. */
  time: number;
  /** Title and time found, but no address text — and events.location is NOT NULL. */
  location: number;
}

interface Candidate {
  title: string;
  link: string;
  startIso: string;
  endIso: string | null;
  location: string;
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

interface PageParse {
  candidates: Candidate[];
  /** Blocks seen, before any filtering — 0 means the listing has run out. */
  blocks: number;
  /**
   * Blocks rejected for STRUCTURAL reasons — the markup moved — as opposed to the relevance
   * and window filters, which reject on merit and are expected to reject most of a library
   * calendar. Folding those in would make the page-level diagnostic fire on every healthy run.
   *
   * Split by layer because each fails independently and the fix differs: the block marker can
   * still match while the title anchor moves, the anchor can match while the <time> element is
   * renamed, and both can match while the address field's wrapper class changes. Counting only
   * the first layer would leave the other two silent, which is the failure mode this exists to
   * prevent.
   */
  misses: StructuralMisses;
  /** Latest start on the page, to decide whether the window has been walked past. */
  maxStartMs: number;
}

function parsePage(html: string, source: Source, ctx: AdapterContext): PageParse {
  const chunks = html.split(BLOCK_MARKER).slice(1);
  const candidates: Candidate[] = [];
  const misses: StructuralMisses = { title: 0, time: 0, location: 0 };
  let maxStartMs = 0;

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

    TIME_RE.lastIndex = 0;
    const times = [...chunk.matchAll(TIME_RE)].map((m) => m[1]);
    const startIso = offsetIsoToUtc(times[0]);
    if (!startIso) {
      misses.time++;
      continue;
    }
    const startMs = Date.parse(startIso);
    if (startMs > maxStartMs) maxStartMs = startMs;

    // Address is read here, BEFORE the filters, even though it is only needed for rows that
    // survive them. Reading it after would put a structural failure downstream of a
    // merit-based one: if LOCATION_RE stopped matching, the blocks that cleared relevance
    // would drop at a `continue` no counter reaches, and because relevance already rejected
    // most of the page on merit, `structural === blocks` could never reach equality to
    // detect it. Keeping the whole extraction chain — title, time, location — ahead of the
    // filters means one comparison covers all of it. Same call adapters/capilano.ts made for
    // its venue. The cost is a regex on rows about to be discarded, over ten blocks a page.
    const locationMatch = chunk.match(LOCATION_RE);
    const location = clean(locationMatch?.[1]);
    if (!location) {
      // events.location is NOT NULL, so a row without one cannot be stored at all.
      misses.location++;
      continue;
    }

    // Track the window before relevance, so the walk can stop on dates even when a page
    // happens to contain nothing relevant.
    if (source.relevanceFilter && !isSettlementRelevant(fullTitle)) continue;
    if (startMs < ctx.nowMs || startMs > ctx.windowEndMs) continue;

    let endIso = offsetIsoToUtc(times[1]);
    if (endIso && Date.parse(endIso) <= startMs) endIso = null;

    candidates.push({
      title: fullTitle.slice(0, MAX_TITLE_CHARS),
      link: `https://${source.host}${href}`,
      startIso,
      endIso,
      location,
    });
  }

  return { candidates, blocks: chunks.length, misses, maxStartMs };
}

export async function fetchEvents(source: Source, ctx: AdapterContext): Promise<EventRow[]> {
  const candidates: Candidate[] = [];
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
        // No block marker on the page. Either the listing ran out, or the markup changed
        // under us — a Drupal theme update renaming the wrapper class, a soft-404, or an
        // interstitial served with HTTP 200. Page 0 is never legitimately empty for a live
        // listing, so that case is a parse failure and is logged as one; without this the
        // walk breaks, `stoppedEarly` suppresses the cap warning, and the source returns
        // zero rows logged exactly like a genuinely empty calendar.
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
      // while something inside it moved — the title anchor, the <time> element, or the
      // address field. Checked across all three layers rather than the title alone: each
      // fails independently, and a source returning zero because its <time> markup changed
      // looks exactly like a library with nothing on. Without this the walk burns all
      // MAX_PAGES and exits through the cap warning below, which reads "listings beyond the
      // cap" when the truth is "the markup moved" — misattributed rather than silent, but
      // just as useless. The relevance and window filters are deliberately NOT counted here.
      const m = parsed.misses;
      if (pagesWalked === 1 && m.title + m.time + m.location === parsed.blocks) {
        console.error(
          `events-crawler: ${source.slug} matched ${parsed.blocks} block(s) on page 0 but ` +
            `extracted none of them (title ${m.title}, time ${m.time}, location ` +
            `${m.location}) — the row markup has probably changed`,
        );
      }
      candidates.push(...parsed.candidates);
      if (parsed.maxStartMs > ctx.windowEndMs) pastWindow = true;
    }

    if (exhausted || pastWindow || candidates.length >= MAX_PER_ORG) {
      stoppedEarly = true;
      break;
    }
  }

  if (!stoppedEarly && pagesWalked >= MAX_PAGES) {
    console.warn(
      `events-crawler: ${source.slug} stopped at the ${MAX_PAGES}-page cap with ` +
        `${candidates.length} candidate(s) — listings beyond it are the furthest out and ` +
        `will be picked up on a later run.`,
    );
  }

  // Dedupe by link (slug + eventdate is unique per occurrence) in case the listing shifts
  // between page fetches and repeats a row.
  const byLink = new Map<string, Candidate>();
  for (const c of candidates) {
    if (!byLink.has(c.link)) byLink.set(c.link, c);
  }
  const deduped = [...byLink.values()];
  deduped.sort((a, b) => a.startIso.localeCompare(b.startIso));
  const selected = deduped.slice(0, MAX_PER_ORG);

  console.log(
    `events-crawler: ${source.slug} walked ${pagesWalked} page(s), ${candidates.length} ` +
      `in-window + relevant (${deduped.length} unique), taking soonest ${selected.length}`,
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
      // The listing ships no image, so this always falls through to the Pexels topic photo
      // and then the deterministic Unsplash pool.
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
