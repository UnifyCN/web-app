// Read-only preview harness for the events-crawler adapters.
//
// SAFETY: this script has NO write path. It never imports the Supabase client, never
// constructs one, and has no --apply flag to add one — it fetches a source's feed and
// prints the rows the crawler WOULD insert. It cannot touch the shared events table, and
// it does not go near the cron. That is the whole point: the deployed function is
// INSERT-only with no dry-run mode, so invoking it to "test" a change writes to prod.
//
// It imports the real adapter modules rather than copying their logic, so what you see
// here is what a run would produce — the two cannot drift.
//
// RUN (from web-app/):
//   deno run --allow-net --allow-env=PEXELS_API_KEY \
//     supabase/functions/events-crawler/dryrun.ts --source vpl
//   …--source vpl --json     # full rows as JSON
//   …--list                  # the registry, with enabled / filtered flags
//
// The env grant is scoped to PEXELS_API_KEY because the tier-2 cover lookup reads it.
// Leaving it unset locally is fine and is the common case: fetchPexelsCandidates returns
// [] without a key, so covers fall through to the deterministic Unsplash pool — which is
// exactly what production does when the secret is absent.
//
// Disabled sources can be previewed here — that is what makes it possible to review a
// staged source before anyone flips `enabled`.

import * as bibliocommons from './adapters/bibliocommons.ts';
import * as tribe from './adapters/tribe.ts';
import { ORG_TIMEZONE, WINDOW_MONTHS } from './lib/constants.ts';
import { todayInTimezone, windowEndInTimezone } from './lib/dates.ts';
import type { Adapter, AdapterContext, EventRow, Source, SourceKind } from './lib/types.ts';

const ADAPTERS: Record<SourceKind, Adapter> = {
  tribe: tribe.fetchEvents,
  bibliocommons: bibliocommons.fetchEvents,
};

/**
 * Mirrors the registry in index.ts. Kept as a literal rather than imported because
 * index.ts calls Deno.serve at module scope — importing it would start a server.
 * Adding a source to index.ts means adding it here too.
 */
const SOURCES: Source[] = [
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
    host: 'vpl',
    enabled: false,
    relevanceFilter: true,
  },
];

function arg(name: string): string | undefined {
  const i = Deno.args.indexOf(`--${name}`);
  return i >= 0 ? Deno.args[i + 1] : undefined;
}

function printRow(row: EventRow, i: number): void {
  const end = row.event_end_datetime ? ` → ${row.event_end_datetime}` : '';
  console.log(`\n${String(i + 1).padStart(2)}. ${row.title}`);
  console.log(`    when     ${row.event_datetime}${end}`);
  console.log(`    where    ${row.location}  [${row.event_type}]`);
  if (row.address) console.log(`    address  ${row.address}`);
  console.log(`    genre    ${row.genre}`);
  console.log(`    host     ${row.hosted_by ?? '(none)'}`);
  console.log(`    link     ${row.external_link}`);
  console.log(`    cover    ${row.cover_photo_url ?? '(none)'}`);
  const desc = (row.description ?? '').split('\n')[0] ?? '';
  console.log(`    desc     ${desc.slice(0, 100)}${desc.length > 100 ? '…' : ''}`);
}

if (Deno.args.includes('--list')) {
  console.log('Sources:');
  for (const s of SOURCES) {
    const flags = [s.enabled ? 'enabled' : 'DISABLED', s.relevanceFilter ? 'relevance-filtered' : '']
      .filter(Boolean)
      .join(', ');
    console.log(`  ${s.slug.padEnd(18)} ${s.kind.padEnd(15)} ${flags}`);
  }
  Deno.exit(0);
}

const slug = arg('source');
if (!slug) {
  console.error('Usage: dryrun.ts --source <slug> [--json] | --list');
  Deno.exit(1);
}

const source = SOURCES.find((s) => s.slug === slug);
if (!source) {
  console.error(`Unknown source '${slug}'. Run with --list to see the registry.`);
  Deno.exit(1);
}

const now = new Date();
const ctx: AdapterContext = {
  pexelsCache: new Map(),
  windowEndMs: Date.parse(`${windowEndInTimezone(ORG_TIMEZONE, WINDOW_MONTHS, now)}T23:59:59Z`),
  nowMs: now.getTime(),
  today: todayInTimezone(ORG_TIMEZONE, now),
  windowEnd: windowEndInTimezone(ORG_TIMEZONE, WINDOW_MONTHS, now),
};

console.log(
  `DRY RUN — ${source.slug} (${source.kind}), window ${ctx.today} → ${ctx.windowEnd}, ` +
    `${source.enabled ? 'enabled' : 'DISABLED in production'}. No writes.\n`,
);

const rows = await ADAPTERS[source.kind](source, ctx);

if (Deno.args.includes('--json')) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  rows.forEach(printRow);
}

console.log(`\n${rows.length} row(s) would be inserted. Nothing was written.`);
