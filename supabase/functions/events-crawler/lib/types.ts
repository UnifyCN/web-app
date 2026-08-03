// Shared shapes for the crawler registry, its adapters, and the rows they produce.

/**
 * Which adapter handles a source. Adding a value here means adding an entry to the
 * ADAPTERS map in index.ts — the map is exhaustive over this union, so a missing
 * implementation is a type error rather than a runtime surprise.
 */
export type SourceKind =
  | 'tribe'
  | 'bibliocommons'
  | 'livewhale'
  | 'communico'
  | 'surrey-drupal'
  | 'nvcl-drupal'
  | 'capilano';

export interface Source {
  /** Stored into `events.source` as `crawler:<slug>`. */
  slug: string;
  /** Fallback hosted_by / display name when an event carries no organizer. */
  name: string;
  /** Which adapter fetches this source. */
  kind: SourceKind;
  /** Hostname for host-based sources; the library slug for BiblioCommons. */
  host: string;
  /**
   * Whether a run actually crawls this source. New sources land as `false`.
   *
   * The weekly cron is LIVE (20260724120000_events_crawler_cron.sql — pg_cron jobid 18,
   * 'events-crawler-weekly', Mondays 14:00 UTC), so deploying this function is what puts
   * a new source into production: the next run would auto-publish it into the shared
   * events table the mobile app reads. Landing new sources disabled decouples the two,
   * leaving activation as its own one-line, reviewable change — which needs Savar's
   * sign-off, since it writes into shared mobile-facing data (CLAUDE.md, "Decision
   * Authority").
   */
  enabled: boolean;
  /**
   * Apply the settlement-relevance filter to this source's titles (see lib/relevance.ts).
   *
   * Set on libraries and universities, whose calendars are mostly storytimes, teen
   * gaming and academic seminars. NOT set on the settlement agencies, where everything
   * published is already on-mission and filtering would only lose events.
   */
  relevanceFilter?: boolean;
  /**
   * Location to use when the source's feed carries no location data at all. Only for
   * feeds where the field genuinely does not exist — never to paper over a parse miss,
   * since `events.location` is NOT NULL and a wrong location is worse than a dropped row.
   */
  defaultLocation?: string;
}

/**
 * public.events.genre is a pre-existing shared column (default 'Uncategorized'). The
 * mobile app types it as EventGenre and ships a genre chip filter that is currently
 * commented out; the first five values below are exactly its enum, so nothing renames
 * when Savar uncomments it — Language/Health/Family/Education are purely additive.
 */
export type EventGenre =
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

/** Exactly the insert shape for public.events. */
export interface EventRow {
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

/** Per-run state threaded into every adapter. */
export interface AdapterContext {
  /**
   * Pexels candidate-list memo, one per run and shared across sources, so identical
   * topic queries cost a single API call.
   */
  pexelsCache: Map<string, Promise<string[]>>;
  /** Far edge of the rolling window as epoch ms — the per-row backstop. */
  windowEndMs: number;
  /**
   * Run start as epoch ms — the near edge of the window. Adapters whose source has no
   * server-side "from today" bound (BiblioCommons returns its entire calendar, past
   * included) must apply this themselves, or already-finished events get ingested.
   */
  nowMs: number;
  /** Today as YYYY-MM-DD on the source's calendar. */
  today: string;
  /** Window end as YYYY-MM-DD on the source's calendar. */
  windowEnd: string;
}

/**
 * An adapter turns one source into rows ready for insert. It is responsible for its own
 * fetching, mapping, window filtering, relevance filtering and image resolution, and
 * must never throw — a source that fails returns [] so the other sources still land.
 */
export type Adapter = (source: Source, ctx: AdapterContext) => Promise<EventRow[]>;
