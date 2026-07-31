// Adapter: BiblioCommons BiblioEvents. Currently one source — Vancouver Public Library.
//
// The gateway is the library SPA's own JSON API: unauthenticated, but undocumented and
// unversioned in practice, so treat a shape change as expected maintenance rather than a
// surprise. Every failure path returns [] so one library can't take a run down.
//
// CAUTION when adding a library: the `host` here is a BiblioCommons tenant slug, and the
// obvious guess is not always the right tenant. `bpl` is BOSTON Public Library, not
// Burnaby — it returns a perfectly healthy feed of Copley Square events that would look
// plausible in a log and be entirely wrong in the app. Burnaby's tenant is `burnaby`, and
// it answers "The Events feature is not available", so it cannot be crawled this way at
// all. Preview any new slug with dryrun.ts and read the branch names before enabling it.
//
// The awkward part is that the API supports NO date filtering and NO sorting. Verified
// 2026-07-31 against VPL: startDate, endDate, from/to, start/end, minDate, after,
// dateRange, sort and sortBy are all silently ignored — `count` stays at the full catalog
// size and the returned order is arbitrary (page 1 came back 2026-08-20, 2026-12-01,
// 2026-10-31). `limit` caps out at 100; 500 and 1000 return an empty body.
//
// So "the soonest 25 events inside the 4-month window" cannot be expressed as a query. We
// page the whole catalog (VPL: 1,997 events over 20 pages), filter and sort client-side,
// then cap. Fetching only the first few pages would be far cheaper but would return an
// arbitrary subset rather than the soonest events, with no way to tell from the result
// that it had happened.
//
// Images are resolved only for the final capped slice, not for every candidate — the
// three-tier resolver does a HEAD probe per image, and probing thousands would dominate
// the run.

import { FETCH_TIMEOUT_MS, MAX_PER_ORG, MAX_TITLE_CHARS, USER_AGENT } from '../lib/constants.ts';
import { offsetIsoToUtc } from '../lib/dates.ts';
import { genreForEvent } from '../lib/genre.ts';
import { resolveCover } from '../lib/images.ts';
import { isSettlementRelevant } from '../lib/relevance.ts';
import { clean, htmlToParagraphs, isOnlineVenueName } from '../lib/text.ts';
import type { AdapterContext, EventRow, Source } from '../lib/types.ts';

const GATEWAY = 'https://gateway.bibliocommons.com/v2/libraries';
/** The API's own ceiling — 500 and 1000 return an empty body. */
const PAGE_LIMIT = 100;
/**
 * Backstop against a catalog that grows (or a pagination bug that never terminates).
 * Comfortably above today's worst case — VPL at 20 pages — with room for a busier tenant.
 * Hitting it is logged, never silent: a truncated crawl must not look like a complete one.
 */
const MAX_PAGES = 45;
/** Concurrent page fetches. Enough to keep the run short, polite enough not to hammer. */
const PAGE_CONCURRENCY = 4;

interface BiblioAddress {
  number?: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
}

interface BiblioEntities {
  events?: Record<string, BiblioEvent>;
  locations?: Record<string, { name?: string }>;
  places?: Record<string, { name?: string; address?: BiblioAddress }>;
  images?: Record<string, { url?: string; tag?: string }>;
}

interface BiblioEvent {
  id?: string;
  /** UTC, ISO with Z. `definition.start` is the same instant without an offset — don't use it. */
  indexStart?: string;
  indexEnd?: string;
  definition?: {
    title?: string;
    description?: string;
    isCancelled?: boolean;
    featuredImageId?: string | null;
    branchLocationId?: string | null;
    nonBranchLocationId?: string | null;
    contact?: { name?: string };
  };
}

interface BiblioPage {
  events?: { pagination?: { pages?: number; count?: number } };
  entities?: BiblioEntities;
}

/** One event as parsed, before the expensive image tier runs. */
interface Candidate {
  id: string;
  title: string;
  startIso: string;
  endIso: string | null;
  description: string | null;
  location: string;
  address: string | null;
  eventType: EventRow['event_type'];
  imageUrl: string | null;
}

async function fetchPage(source: Source, page: number): Promise<BiblioPage | null> {
  const url = `${GATEWAY}/${encodeURIComponent(source.host)}/events?limit=${PAGE_LIMIT}&page=${page}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });
    if (!res.ok) {
      console.error(`events-crawler: ${source.slug} page ${page} returned HTTP ${res.status}`);
      return null;
    }
    return (await res.json()) as BiblioPage;
  } catch (error) {
    console.error(`events-crawler: ${source.slug} page ${page} failed:`, error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Parse one page into candidates. The locations / places / images maps are per-response,
 * so they must be read from the same page as the events that reference them.
 */
function candidatesFromPage(page: BiblioPage, source: Source, ctx: AdapterContext): Candidate[] {
  const entities = page.entities ?? {};
  const events = entities.events ?? {};
  const out: Candidate[] = [];

  for (const [id, ev] of Object.entries(events)) {
    const def = ev?.definition;
    if (!def || def.isCancelled === true) continue;

    // Filter on the FULL cleaned title, then truncate for storage — a relevant keyword
    // past MAX_TITLE_CHARS would otherwise be invisible to the filter.
    const fullTitle = clean(def.title);
    if (!fullTitle) continue;
    if (source.relevanceFilter && !isSettlementRelevant(fullTitle)) continue;
    const title = fullTitle.slice(0, MAX_TITLE_CHARS);

    const startIso = offsetIsoToUtc(ev.indexStart);
    if (!startIso) continue;
    // Both edges enforced here: the API has no "from today" bound, so without the lower
    // check the catalog's past events would be ingested alongside the upcoming ones.
    const startMs = Date.parse(startIso);
    if (startMs < ctx.nowMs || startMs > ctx.windowEndMs) continue;

    const branch = def.branchLocationId ? entities.locations?.[def.branchLocationId] : undefined;
    const place = def.nonBranchLocationId
      ? entities.places?.[def.nonBranchLocationId]
      : undefined;
    const location =
      clean(branch?.name) || clean(place?.name) || clean(def.contact?.name);
    if (!location) continue; // events.location is NOT NULL

    const addr = place?.address;
    const address = addr
      ? [[addr.number, addr.street].map((p) => clean(p)).filter(Boolean).join(' '), addr.city, addr.state, addr.zip]
          .map((p) => clean(p))
          .filter(Boolean)
          .join(', ') || null
      : null;

    // A featured image tagged EventType is the shared category placeholder (the same
    // "activities-and-games.png" is reused across dozens of unrelated events), so skip it
    // and let the Pexels tier supply something that actually matches this event.
    const image = def.featuredImageId ? entities.images?.[def.featuredImageId] : undefined;
    const imageUrl =
      image && image.tag !== 'EventType' && typeof image.url === 'string' ? image.url : null;

    out.push({
      id: clean(ev.id) || id,
      title,
      startIso,
      endIso: offsetIsoToUtc(ev.indexEnd),
      description: htmlToParagraphs(def.description) || null,
      location,
      address,
      eventType: isOnlineVenueName(location) ? 'online' : 'in-person',
      imageUrl,
    });
  }
  return out;
}

export async function fetchEvents(source: Source, ctx: AdapterContext): Promise<EventRow[]> {
  const first = await fetchPage(source, 1);
  if (!first) return [];

  const reported = first.events?.pagination?.pages ?? 1;
  const totalPages = Math.max(1, Math.min(reported, MAX_PAGES));
  if (reported > MAX_PAGES) {
    console.warn(
      `events-crawler: ${source.slug} reports ${reported} pages, capped at ${MAX_PAGES} — ` +
        `results are a partial view of the catalog; raise MAX_PAGES.`,
    );
  }

  const candidates: Candidate[] = candidatesFromPage(first, source, ctx);

  // Bounded concurrency: a simple sliding window over the remaining page numbers.
  const remaining: number[] = [];
  for (let p = 2; p <= totalPages; p++) remaining.push(p);
  let failedPages = 0;
  for (let i = 0; i < remaining.length; i += PAGE_CONCURRENCY) {
    const batch = remaining.slice(i, i + PAGE_CONCURRENCY);
    const pages = await Promise.all(batch.map((p) => fetchPage(source, p)));
    for (const page of pages) {
      if (page) {
        candidates.push(...candidatesFromPage(page, source, ctx));
      } else {
        failedPages++;
      }
    }
  }
  // A failed page silently shrinks the candidate pool, which would otherwise be
  // indistinguishable from a complete crawl in the summary below — same reasoning as the
  // MAX_PAGES warning.
  if (failedPages > 0) {
    console.warn(
      `events-crawler: ${source.slug} had ${failedPages} failed page fetch(es) of ` +
        `${totalPages} — results are a partial view of the catalog.`,
    );
  }

  // Dedupe by event id before sorting: the catalog has no stable order and is read over
  // many round trips, so a catalog shift mid-pagination can surface the same event on two
  // pages. A duplicate would otherwise consume one of the MAX_PER_ORG slots and pay for a
  // second, redundant cover probe.
  const uniqueById = new Map<string, Candidate>();
  for (const c of candidates) uniqueById.set(c.id, c);
  const deduped = [...uniqueById.values()];

  // Sort ascending and cap only after the whole catalog is in hand — the API's arbitrary
  // order means any earlier cut would be an arbitrary subset, not the soonest events.
  deduped.sort((a, b) => a.startIso.localeCompare(b.startIso));
  const selected = deduped.slice(0, MAX_PER_ORG);

  console.log(
    `events-crawler: ${source.slug} scanned ${totalPages} page(s), ` +
      `${candidates.length} in-window${source.relevanceFilter ? ' + relevant' : ''} ` +
      `(${deduped.length} unique), taking soonest ${selected.length}`,
  );

  // allSettled so one failed cover lookup can't reject the batch and discard the source.
  const settled = await Promise.allSettled(
    selected.map(async (c): Promise<EventRow> => {
      const externalLink = `https://${source.host}.bibliocommons.com/events/${c.id}`;
      return {
        title: c.title,
        description: c.description,
        event_datetime: c.startIso,
        event_end_datetime: c.endIso,
        location: c.location,
        event_type: c.eventType,
        cover_photo_url: await resolveCover(c.imageUrl, c.title, externalLink, ctx.pexelsCache),
        external_link: externalLink,
        hosted_by: source.name,
        address: c.address,
        genre: genreForEvent(c.title, c.description),
        source: `crawler:${source.slug}`,
      };
    }),
  );
  const rows: EventRow[] = [];
  for (const result of settled) {
    if (result.status === 'fulfilled') rows.push(result.value);
    else console.error(`events-crawler: ${source.slug} row failed:`, result.reason);
  }
  return rows;
}
