// Traps for the settlement-relevance filter.
//
// WHY THIS FILE EXISTS. `isSettlementRelevant` is a pure function shared by every
// relevance-filtered source, so a term added for one library silently changes what all of
// them ingest — and the tempting shorthand for each new term is usually the broken one.
// The 2026-08-08 round wanted NVCL's "MS Office … Intro to Excel"; the obvious `\bexcel\b`
// and `\bword\b` also take "Excel in Your Studies", "Crossword Club" and "Wordplay for
// Toddlers". That hazard was previously recorded in BACKLOG.md prose, which cannot fail a
// run. Here it can.
//
// Every string below is a REAL title from a live feed, captured via
// `dryrun.ts --source <slug> --no-filter --titles`. Adding a term means adding its target
// here, and adding any near-miss the corpus shows it brushed against.
//
// RUN (from web-app/):
//   deno test supabase/functions/events-crawler/lib/relevance_test.ts

import { assert } from 'jsr:@std/assert@1';
import { isSettlementRelevant } from './relevance.ts';

/** Real titles the filter must keep, grouped by the term that earns each one. */
const KEEP: Record<string, string[]> = {
  'status & settlement': [
    'Settlement & Integration Services',
    'Employment Services for Newcomers',
    'Newcomer Family Storytime',
    'International Student Orientation - Fall 2026',
    'Circletime success: Welcoming newcomer children at circletime',
  ],
  language: [
    'ESL Conversation Practice',
    'Practice Speaking English: Advanced',
    'English Conversation Program (55+)',
    'English Corner (virtual) — September 2026',
    'Beginner English Corner (in-person) — September 2026',
  ],
  employment: [
    'Canadian Job Search Workshop',
    'Ask a Career Counsellor: Resume Workshop',
    // Accent folding is load-bearing here — a plain `resume` term misses "Résumé". The
    // leading `\b` on `resume` must not cost these: "Resume"/"Résumé" start a word.
    'Résumé Clinic with S.U.C.C.E.S.S.',
    'Resume Writing Workshop',
  ],
  // Housing terms carry a leading `\b` (tenant, rental, renting, lease) so they don't fire
  // on Lieu·tenant / Pa·rental / Pa·renting / P·lease. These prove the boundary still keeps
  // the genuine article, where the word starts the match — the DROP block below proves it
  // rejects the swallowing words.
  housing: [
    'Rental Housing Info Session',
    'Tenant Rights Workshop',
    'Renting 101: Know Your Rights',
    'Lease Agreement Basics for Newcomers',
  ],
  'digital literacy': [
    'Tech Help',
    'Device Clinic',
    // Accent folding again: "Café", and the Farsi title carries combining marks.
    'Tech Café - Capilano (Drop-In)',
    'Farsi Tech Café / تِکِ کافه - Lynn Valley',
    // Added 2026-08-08 — `technology` spelled out, 21 rows across NVCL + Surrey.
    'One on One Technology Help',
    'Drop-in Technology Help',
    'Drop-in technology help in Farsi کمک به رفع اشکال تکنولوژی به زبان فارسی',
    'Windows laptop help',
    'Mac laptop help',
  ],
  'office suite': [
    'MS Office learn and practice: Intro to Word',
    'MS Office learn and practice: Intro to Excel',
    'Microsoft Word Basics',
    'Intro to Excel',
    'Spreadsheet Basics',
  ],
  'named programs': [
    'Open door community hub',
    'Open Door Community Hub Drop-In',
  ],
};

/**
 * Titles the filter must reject. The first block is the near-misses — each one is what a
 * lazier version of a term above would have caught, so these are the assertions that
 * actually earn their keep. The rest is ordinary library programming, there to prove the
 * filter still rejects the bulk of a what's-on calendar.
 */
const DROP: Record<string, string[]> = {
  'near-misses for the office-suite terms': [
    'Excel in Your Studies: Study Skills',
    'Crossword Club',
    'Wordplay for Toddlers',
    'Word Whips',
    'Word Games Night',
    'Sword Fighting Demo',
    'Keyword Search Basics',
    'PowerPoint Karaoke Night',
    'Microsoft Flight Simulator Club',
  ],
  'near-misses for tech(nology) and laptop help': [
    'Tech for tots',
    'Technology terminology',
    'Tech Club',
    'SFU Burnaby Science Alive High School Camps: A Byte of Tech',
    'Repair Café',
    // `tech` inside a longer word — the reason the alternative carries a leading `\b`.
    // Constructed rather than captured: plausible SFU titles, not yet seen in a feed.
    'Biotech Help',
    'Fintech Support',
    'Edtech Café',
  ],
  'near-misses for open door': [
    'Open Door Poetry Reading',
    'Open Doors Heritage Tour',
    'Open sewing studio',
    'Open gaming: Minecraft',
  ],
  'near-miss for a bare `orientation`': [
    // Why `orientation` is deliberately absent — see isSettlementRelevant's doc comment.
    'Recording Studio Orientation',
  ],
  // Left-word-boundary swallows: each housing/employment term is a substring of a common
  // unrelated word, so before the leading `\b` these titles were wrongly KEPT. Constructed,
  // not captured (zero live incidence in the corpus today) — but latent, and the `\b` fix
  // that added this group NARROWS the regex, so these lock it in. See BACKLOG.md.
  'left-word-boundary swallows (lease/rental/renting/tenant/resume)': [
    'Please Note: Library Closed Monday', // P·lease  → lease
    'Parental Controls: Keeping Kids Safe Online', // Pa·rental → rental
    'Parenting Support Circle', // Pa·renting → renting
    'Lieutenant Governor Reading Award Ceremony', // Lieu·tenant → tenant
    'Presumed Innocent: Film Screening', // P·resume·d → resume
  ],
  'ordinary library programming': [
    'Babytime',
    'Family Storytime',
    'Teen open space',
    'Craft \'N\' Yarn',
    'North Shore knitters',
    'Book Bike at Lonsdale Quay Market',
    'LEGO® Block Party',
    'Simorgh: a self-portrait',
    'Yuehao Hu | MSc Thesis Defence',
    'Adult Colouring Club',
    'Scrabble® Sundays',
  ],
};

Deno.test('isSettlementRelevant keeps real settlement titles', () => {
  for (const [group, titles] of Object.entries(KEEP)) {
    for (const title of titles) {
      assert(isSettlementRelevant(title), `[${group}] should KEEP: ${title}`);
    }
  }
});

Deno.test('isSettlementRelevant rejects near-misses and general programming', () => {
  for (const [group, titles] of Object.entries(DROP)) {
    for (const title of titles) {
      assert(!isSettlementRelevant(title), `[${group}] should DROP: ${title}`);
    }
  }
});

// STRICT MODE (Source.strictRelevance, set on NVCL + Capilano — see relevance.ts). Strict
// drops the whole digital-literacy / tech-help group while keeping every settlement term.
// All STRICT_FLIP titles are REAL, captured from NVCL's live window on 2026-08-09; they are
// exactly the rows Savar's review flagged as too broad.

/** Kept by the DEFAULT filter, dropped by STRICT — the digital-literacy group. */
const STRICT_FLIP: string[] = [
  'Drop-in technology help',
  'Drop-in technology help in Farsi کمک به رفع اشکال تکنولوژی به زبان فارسی',
  'Mac laptop help',
  'Windows laptop help',
  'MS Office learn and practice: Intro to Word',
  // Constructed, not captured. The bare `literacy` core term (kept for Family/Adult
  // Literacy) would re-admit this under strict without the `(?<!digital\s)` guard — the
  // default keeps it via the `digital literacy` term. Locks that guard in.
  'Digital Literacy Basics',
];

/** Kept by BOTH filters — settlement content strict must never drop. */
const STRICT_KEEP: string[] = [
  'Open door community hub', // named program
  'Fall 2026 New International Student Orientation', // international student
  'English Corner (virtual) — September 2026', // language
  'Circletime success: Welcoming newcomer children at circletime', // newcomer
  'Résumé Clinic with S.U.C.C.E.S.S.', // employment
  // The `digital`-guard on `literacy` must not cost genuine reading-literacy titles: this
  // matches bare `literacy` (no "digital" before it), so strict keeps it.
  'Adult Literacy Program',
];

Deno.test('strict mode drops the digital-literacy group the default filter keeps', () => {
  for (const title of STRICT_FLIP) {
    assert(isSettlementRelevant(title), `default filter should KEEP: ${title}`);
    assert(!isSettlementRelevant(title, { strict: true }), `strict filter should DROP: ${title}`);
  }
});

Deno.test('strict mode keeps genuine settlement content', () => {
  for (const title of STRICT_KEEP) {
    assert(isSettlementRelevant(title, { strict: true }), `strict filter should KEEP: ${title}`);
  }
});
