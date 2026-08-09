// Read-only preview harness for the events-crawler adapters.
//
// SAFETY: this script has NO write path. It never imports the Supabase client, never
// constructs one, and has no --apply flag to add one — it fetches a source's feed and
// prints the rows the crawler WOULD insert. It cannot touch the shared events table, and
// it does not go near the cron. That is the whole point: the deployed function is
// INSERT-only with no dry-run mode, so invoking it to "test" a change writes to prod.
//
// It imports the real registry, adapter map and context factory from lib/sources.ts —
// the exact wiring index.ts uses — so the preview cannot drift from a real run.
//
// RUN (from web-app/):
//   deno run --allow-net --allow-env=PEXELS_API_KEY \
//     supabase/functions/events-crawler/dryrun.ts --source vpl
//   …--source vpl --json     # full rows as JSON
//   …--source vpl --titles   # one KEEP/DROP line per row, no detail
//   …--source vpl --no-filter --titles   # the source's WHOLE calendar, with verdicts
//   …--list                  # the registry, with enabled / filtered flags
//
// The env grant is scoped to PEXELS_API_KEY because the tier-2 cover lookup reads it.
// Leaving it unset locally is fine and is the common case: fetchPexelsCandidates returns
// [] without a key, so covers fall through to the deterministic Unsplash pool — which is
// exactly what production does when the secret is absent.
//
// Disabled sources can be previewed here — that is what makes it possible to review a
// staged source before anyone flips `enabled`.
//
// WHY --no-filter EXISTS. lib/relevance.ts is shared by every filtered source, so a term
// added for one library changes what all of them ingest. A normal dry run cannot measure
// that: it shows only the titles that already PASSED, while the whole question is which
// currently-rejected titles a new term would let in. --no-filter runs the adapter against
// a copy of the Source with relevanceFilter off, so the output is the source's entire
// calendar; --titles then prints each one with the verdict the real filter gives it. Diff
// that before and after a relevance change and every flip is visible.
//
// It stays write-free: the override is a local object spread, the registry itself is not
// mutated, and there is still no Supabase import anywhere in this file.

import { ADAPTERS, makeContext, SOURCES } from './lib/sources.ts';
import { isSettlementRelevant } from './lib/relevance.ts';
import type { EventRow } from './lib/types.ts';

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

/**
 * One line per row: the verdict lib/relevance.ts gives the title, then the date and title.
 *
 * `filtered` is the source's REGISTRY setting, not the setting this run used. A settlement
 * agency is never relevance-filtered, so printing KEEP/DROP beside its events would invite
 * exactly the wrong conclusion — those rows are ingested either way. Hence `n/a`.
 */
function printTitle(row: EventRow, filtered: boolean): void {
  const verdict = !filtered ? 'n/a ' : isSettlementRelevant(row.title) ? 'KEEP' : 'DROP';
  console.log(`${verdict}  ${row.event_datetime.slice(0, 10)}  ${row.title}`);
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
  console.error('Usage: dryrun.ts --source <slug> [--json|--titles] [--no-filter] | --list');
  Deno.exit(1);
}

const registered = SOURCES.find((s) => s.slug === slug);
if (!registered) {
  console.error(`Unknown source '${slug}'. Run with --list to see the registry.`);
  Deno.exit(1);
}

// Copy rather than mutate: SOURCES is the shared registry every other import sees.
const noFilter = Deno.args.includes('--no-filter');
const source = noFilter ? { ...registered, relevanceFilter: false } : registered;

const ctx = makeContext();

console.log(
  `DRY RUN — ${source.slug} (${source.kind}), window ${ctx.today} → ${ctx.windowEnd}, ` +
    `${registered.enabled ? 'enabled' : 'DISABLED in production'}` +
    `${noFilter ? ', RELEVANCE FILTER OFF for this run' : ''}. No writes.\n`,
);

const rows = await ADAPTERS[source.kind](source, ctx);

if (Deno.args.includes('--json')) {
  console.log(JSON.stringify(rows, null, 2));
} else if (Deno.args.includes('--titles')) {
  rows.forEach((row) => printTitle(row, Boolean(registered.relevanceFilter)));
} else {
  rows.forEach(printRow);
}

// With --no-filter the count is what the source PUBLISHES, not what the crawler would take:
// production still applies the filter. Say so, so a capture can't be misread as a forecast.
const verb = noFilter ? 'row(s) in the source calendar (filter off)' : 'row(s) would be inserted';
console.log(`\n${rows.length} ${verb}. Nothing was written.`);
