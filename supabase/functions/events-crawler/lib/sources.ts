// The source registry, the adapter map, and the per-run context factory.
//
// Side-effect free on purpose: index.ts calls Deno.serve at module scope, so anything that
// needs this wiring without starting a server (the dryrun harness) has to import it from
// here. Keeping one definition means the preview and a real run cannot drift.

import * as bibliocommons from '../adapters/bibliocommons.ts';
import * as capilano from '../adapters/capilano.ts';
import * as communico from '../adapters/communico.ts';
import * as livewhale from '../adapters/livewhale.ts';
import * as nvcl from '../adapters/nvcl.ts';
import * as surrey from '../adapters/surrey.ts';
import * as tribe from '../adapters/tribe.ts';
import { ORG_TIMEZONE, WINDOW_MONTHS } from './constants.ts';
import { todayInTimezone, windowEndInTimezone } from './dates.ts';
import type { Adapter, AdapterContext, Source, SourceKind } from './types.ts';

// Phase 1: the five highest-relevance orgs, all on The Events Calendar (Tribe).
// Phase 2: five further sources from the 2026-07-29 scoping round — enabled 2026-08-02 on
// Savar's sign-off, after landing staged and disabled across PRs #83/#84/#86/#87.
//
// Adding a source: pick the `kind` whose adapter fits (test the feed first), allowlist its
// image host in next.config.ts, and land it `enabled: false`. Staging a source disabled is
// still the rule for anything new — it lets dryrun.ts preview a real feed before a single
// row can reach the shared events table.
//
// NOTE on virtual events: none of the Tribe orgs sets Tribe's `is_virtual` flag (it ships
// with the paid Virtual Events add-on) — it is false or absent on every event. They mark
// online events by registering a venue named "Online" / "Webinar" instead, which is why
// isOnlineVenueName drives event_type. Don't rely on `is_virtual` alone.
//
// centrecanada.org is healthy but currently returns total:0 (empty upcoming calendar) —
// a zero count from it is expected, not a fetch failure.
export const SOURCES: Source[] = [
  { slug: 'mosaic', name: 'MOSAIC', kind: 'tribe', host: 'mosaicbc.org', enabled: true },
  {
    slug: 'burnaby-nh',
    name: 'Burnaby Neighbourhood House',
    kind: 'tribe',
    host: 'burnabynh.ca',
    enabled: true,
  },
  { slug: 'success', name: 'S.U.C.C.E.S.S.', kind: 'tribe', host: 'successbc.ca', enabled: true },
  {
    slug: 'centre-canada',
    name: 'CentreCanada',
    kind: 'tribe',
    host: 'centrecanada.org',
    enabled: true,
  },
  {
    slug: 'pirs',
    name: 'Pacific Immigrant Resources Society',
    kind: 'tribe',
    host: 'pirs.bc.ca',
    enabled: true,
  },

  // --- Phase 2, enabled in this registry 2026-08-02 ---
  // Enabled here is not the same as live: ACTIVE_SOURCES only widens for a run once this
  // function is *deployed*, and the deploy is a separate, separately-approved step. Until
  // it happens production keeps running the previously deployed bundle and crawls Phase 1
  // alone, however this file reads.
  // All are libraries, so `relevanceFilter` is on: their calendars are mostly storytimes
  // and drop-in clubs, with settlement content a small minority. See lib/relevance.ts.
  {
    slug: 'westvan-library',
    name: 'West Vancouver Memorial Library',
    kind: 'tribe',
    host: 'westvanlibrary.ca',
    enabled: true,
    relevanceFilter: true,
  },
  {
    slug: 'vpl',
    name: 'Vancouver Public Library',
    kind: 'bibliocommons',
    host: 'vpl', // BiblioCommons tenant slug, not a hostname — see the adapter's caution
    enabled: true,
    relevanceFilter: true,
  },
  // Burnaby Public Library is deliberately absent: its BiblioCommons tenant (`burnaby`)
  // answers "The Events feature is not available", and bpl.bc.ca/events is a client-
  // rendered SPA with nothing server-side to read. Note `bpl` on BiblioCommons is BOSTON
  // Public Library — a healthy but entirely wrong feed. See adapters/bibliocommons.ts.
  {
    slug: 'sfu',
    name: 'Simon Fraser University',
    kind: 'livewhale',
    host: 'events.sfu.ca',
    enabled: true,
    relevanceFilter: true,
  },
  {
    // NVDPL-wide, not Lynn Valley alone: the RSS endpoint ignores the `?l=<branch>`
    // filter its own UI uses and returns the identical system-wide set regardless.
    slug: 'nvdpl',
    name: 'North Vancouver District Public Library',
    kind: 'communico',
    host: 'nvdpl.events.mylibrary.digital',
    enabled: true,
    relevanceFilter: true,
    // The feed carries no location field of any kind — see adapters/communico.ts.
    defaultLocation: 'North Vancouver District Public Library',
  },
  {
    slug: 'surrey-libraries',
    name: 'Surrey Libraries',
    kind: 'surrey-drupal',
    host: 'surreylibraries.ca',
    enabled: true,
    relevanceFilter: true,
  },

  // --- Phase 3, enabled in this registry 2026-08-09 on Savar's sign-off ---
  // Deferred from the 2026-07-29 round on the belief that their listings carried no dates
  // and would need a per-event fetch. Re-checked 2026-08-02: not so — the date is in the
  // listing, so no N+1. See each adapter's header for what the re-check actually found.
  //
  // Same caveat as Phase 2 above: enabled here is not the same as live. ACTIVE_SOURCES only
  // widens for a run once this function is *deployed*.
  {
    // NVCL, not NVDPL: different library system, different feed. Its BiblioCommons tenant
    // is correctly named but answers 403 "The Events feature is not available", the same
    // dead end as Burnaby — hence a Drupal scraper rather than the bibliocommons adapter.
    slug: 'nvcl',
    name: 'North Vancouver City Library',
    kind: 'nvcl-drupal',
    host: 'www.nvcl.ca',
    enabled: true,
    relevanceFilter: true,
    // The listing's venue slot is present but empty on every row — see adapters/nvcl.ts.
    defaultLocation: 'North Vancouver City Library',
  },
  {
    // Capped at ~10 items by robots.txt, which disallows the `?…search=…` URLs every
    // calendar-navigation link uses — so a low count here is the ceiling, not a failure.
    // Its calendar is largely academic administrivia (fee deadlines, closures), so expect
    // roughly one on-mission event: measured 1 of 10 on 2026-08-09, the Fall 2026 New
    // International Student Orientation. See adapters/capilano.ts.
    slug: 'capilano',
    name: 'Capilano University',
    kind: 'capilano',
    host: 'www.capilanou.ca',
    enabled: true,
    relevanceFilter: true,
  },
];

/**
 * The sources a run actually crawls. Everything downstream — the fetch fan-out and the
 * per-source counts in the response — is scoped to this, so a disabled source is inert
 * rather than merely unreported.
 */
export const ACTIVE_SOURCES = SOURCES.filter((source) => source.enabled);

/** Exhaustive over SourceKind, so a new kind without an adapter is a compile error. */
export const ADAPTERS: Record<SourceKind, Adapter> = {
  tribe: tribe.fetchEvents,
  bibliocommons: bibliocommons.fetchEvents,
  livewhale: livewhale.fetchEvents,
  communico: communico.fetchEvents,
  'surrey-drupal': surrey.fetchEvents,
  'nvcl-drupal': nvcl.fetchEvents,
  capilano: capilano.fetchEvents,
};

/**
 * Build the per-run context. Computed once per run so every source is bounded by the same
 * instant, and so the Pexels candidate cache is shared across sources (identical topic
 * queries then cost a single API call).
 */
export function makeContext(now: Date = new Date()): AdapterContext {
  const today = todayInTimezone(ORG_TIMEZONE, now);
  const windowEnd = windowEndInTimezone(ORG_TIMEZONE, WINDOW_MONTHS, now);
  return {
    pexelsCache: new Map(),
    // Deliberately loose: parsed as UTC while the date itself is on the source's calendar,
    // so the per-row guard trails a server-side bound by a few hours. It exists to catch a
    // source that ignores (or cannot express) an end bound, not to police the hour.
    windowEndMs: Date.parse(`${windowEnd}T23:59:59Z`),
    nowMs: now.getTime(),
    today,
    windowEnd,
  };
}
