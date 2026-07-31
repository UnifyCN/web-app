// The source registry, the adapter map, and the per-run context factory.
//
// Side-effect free on purpose: index.ts calls Deno.serve at module scope, so anything that
// needs this wiring without starting a server (the dryrun harness) has to import it from
// here. Keeping one definition means the preview and a real run cannot drift.

import * as bibliocommons from '../adapters/bibliocommons.ts';
import * as communico from '../adapters/communico.ts';
import * as livewhale from '../adapters/livewhale.ts';
import * as surrey from '../adapters/surrey.ts';
import * as tribe from '../adapters/tribe.ts';
import { ORG_TIMEZONE, WINDOW_MONTHS } from './constants.ts';
import { todayInTimezone, windowEndInTimezone } from './dates.ts';
import type { Adapter, AdapterContext, Source, SourceKind } from './types.ts';

// Phase 1 (enabled): the five highest-relevance orgs, all on The Events Calendar (Tribe).
// Phase 2 (staged, disabled): further sources from the 2026-07-29 scoping round.
//
// Adding a source: pick the `kind` whose adapter fits (test the feed first), allowlist its
// image host in next.config.ts, and land it `enabled: false`.
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

  // --- Phase 2, staged and NOT crawled until `enabled` flips (see Source.enabled) ---
  // All are libraries, so `relevanceFilter` is on: their calendars are mostly storytimes
  // and drop-in clubs, with settlement content a small minority. See lib/relevance.ts.
  {
    slug: 'westvan-library',
    name: 'West Vancouver Memorial Library',
    kind: 'tribe',
    host: 'westvanlibrary.ca',
    enabled: false,
    relevanceFilter: true,
  },
  {
    slug: 'vpl',
    name: 'Vancouver Public Library',
    kind: 'bibliocommons',
    host: 'vpl', // BiblioCommons tenant slug, not a hostname — see the adapter's caution
    enabled: false,
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
    enabled: false,
    relevanceFilter: true,
  },
  {
    // NVDPL-wide, not Lynn Valley alone: the RSS endpoint ignores the `?l=<branch>`
    // filter its own UI uses and returns the identical system-wide set regardless.
    slug: 'nvdpl',
    name: 'North Vancouver District Public Library',
    kind: 'communico',
    host: 'nvdpl.events.mylibrary.digital',
    enabled: false,
    relevanceFilter: true,
    // The feed carries no location field of any kind — see adapters/communico.ts.
    defaultLocation: 'North Vancouver District Public Library',
  },
  {
    slug: 'surrey-libraries',
    name: 'Surrey Libraries',
    kind: 'surrey-drupal',
    host: 'surreylibraries.ca',
    enabled: false,
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
