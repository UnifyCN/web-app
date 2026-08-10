// Settlement-relevance filter for library and university sources.
//
// WHY: the five Phase-1 sources are settlement agencies — everything they publish is
// on-mission, so they are never filtered. Libraries and universities publish a general
// programming calendar in which settlement content is a small minority: measured against
// the live feeds, storytimes, baby/toddler programs, teen gaming, board games, gallery
// talks and thesis defences make up the large majority. Ingesting those unfiltered would
// turn the Events tab into a library what's-on listing, burying the settlement events
// this app exists to surface.
//
// TITLE ONLY, deliberately. Matching descriptions too was measured and rejected: library
// blurbs routinely close with lines like "newcomer families welcome", which pulls in
// every storytime and defeats the filter. The cost is real but small — an opaquely-named
// but genuinely relevant event (NVDPL's "Open Door Community Hub Drop-In") is dropped.
// Precision is the right trade here, because a missed event is invisible while a flood of
// irrelevant ones is actively harmful. Revisit by adding terms, not by widening to
// descriptions.
//
// TWO STRENGTHS. The default filter (CORE_TERMS + DIGITAL_LITERACY_TERMS) treats generic
// digital-literacy / tech-help content as on-mission. A STRICT filter (CORE_TERMS only)
// drops that whole group. It exists because most tech-help programming — "Drop-in
// technology help", "Windows laptop help", "MS Office: Intro to Word" — teaches skills the
// app's users already have; it is not settlement-specific the way immigration/legal/
// language content is. Sources opt into strict via `Source.strictRelevance` (lib/types.ts).
// Set on NVCL and Capilano after Savar's 2026-08-09 review of the live output flagged their
// tech-help sessions as too broad — CONFIRMED with him directly, including dropping the
// MS Office / spreadsheet suite, not an assumption. Kept per-source deliberately: the same
// `technology help` term is genuine, wanted content at Surrey, so the fix could not be a
// global revert without regressing a source no one flagged.
//
// Measured keep-rates on the live feeds when this landed (2026-07-31):
//   West Van 8/50 · VPL 6/100 · SFU 5/200 · NVDPL 16/100 · Surrey 2/10 (page 1)
//
// Re-measured 2026-08-08 over each source's WHOLE 4-month window, before → after the
// office-suite / technology-help / Open Door terms below (`dryrun.ts --no-filter
// --titles`, with MAX_PER_ORG raised locally so the walk isn't truncated):
//   West Van 6/50 → 6 · VPL 22/200 → 22 · SFU 3/111 → 3 · NVDPL 11/82 → 20
//   Surrey 31/192 → 46 · NVCL 10/200 → 42 · Capilano 1/10 → 1
// Adding a default term is a union alternative, so it can only add keeps, never drop an
// existing one. Adding a `\b` (below) is the opposite — it NARROWS — so those edits are
// re-verified against the captured corpus, not assumed safe.

/**
 * Accents are stripped before matching (NFD, then drop combining marks), so a single
 * ASCII pattern covers every accented spelling a source might use. This is load-bearing:
 * Surrey publishes "WorkBC Résumé Clinic" and NVDPL publishes "Tech Café", neither of
 * which would match a plain `resume` / `cafe` term without it.
 */
function foldAccents(value: string): string {
  // \u0300-\u036f is the Combining Diacritical Marks block, written escaped because the
  // literal characters are invisible in an editor and trivially corrupted by a bad paste.
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * The settlement-specific terms, always in force. Grouped for reviewability — the groups
 * are purely documentation, the union is what runs. Terms are matched case-insensitively
 * against the accent-folded title.
 *
 * A leading `\b` on `tenant`, `rental`, `renting`, `lease` and `resume`: each is a
 * substring of a common unrelated word — Lieu·tenant, Pa·rental, Pa·renting, P·lease,
 * P·resume·d — so without it the filter wrongly KEEPS "Lieutenant Governor Reading Award",
 * "Parental Controls", "Parenting Support Circle", "Please Note: Library Closed" and
 * "Presumed Innocent: Film Screening". Zero live incidence in the captured corpus today,
 * but latent; see lib/relevance_test.ts for the swallow examples and the real-word keeps
 * that prove the boundary doesn't cost a genuine hit.
 */
const CORE_TERMS = [
  // Status & settlement
  'newcomer|immigrant|immigration|refugee|asylum|settlement|migrant|international\\s+student',
  // Legal & documents
  'citizenship|permanent\\s+resident|pr\\s+card|work\\s+permit|study\\s+permit|visa\\b',
  'social\\s+insurance|sin\\s+clinic|legal\\s+clinic|notary',
  // Language
  '\\besl\\b|\\blinc\\b|english\\s+(conversation|class|corner|practice|language)',
  // `literacy` here means reading/language literacy (Family/Adult Literacy). The
  // `(?<!digital\s)` guard stops it swallowing "Digital Literacy" — which is the digital
  // group's own term (below), so strict mode must drop it, not re-admit it through this
  // core term. The default filter still keeps "Digital Literacy" via that group, so this
  // guard leaves default verdicts unchanged. `financial literacy` is its own finance term.
  'conversation\\s+(circle|club|cafe)|language\\s+(exchange|cafe)|speaking\\s+english|(?<!digital\\s)literacy',
  // Employment
  'job\\s+(search|fair|club|help)|\\bresume|cover\\s+letter|interview\\s+skills|career',
  'employment|workbc|hiring|credential|foreign[-\\s]trained|workplace',
  // Finance
  'tax\\s+clinic|income\\s+tax|banking|bank\\s+account|budgeting|financial\\s+literacy',
  'credit\\s+score',
  // Housing
  'housing|\\btenant|tenancy|\\brental|\\brenting|landlord|\\blease\\b',
  // Named settlement programs. Kept to programs run under the same name by more than
  // one source, so this doesn't become a list of one-off event names: the Open Door
  // community hub is NVCL's and NVDPL's shared newcomer drop-in, 29 occurrences across
  // the two 4-month windows, and was the single largest miss in the corpus. Qualified
  // so it cannot catch "Open Door Poetry Reading" or "Open Doors Heritage Tour".
  'open\\s+door\\s+(community|drop)',
  // Health-system navigation
  'health\\s+card|family\\s+doctor|\\bmsp\\b|medical\\s+insurance',
];

/**
 * Digital-literacy / tech-help terms. In force under the default filter, dropped under the
 * strict filter (see the header). Split out as its own group precisely so a source can opt
 * out of it without losing the settlement terms above.
 */
const DIGITAL_LITERACY_TERMS = [
  // Digital literacy
  // `\b` before tech: without it the alternative matches the tail of "Biotech Help" or
  // "Fintech Support", both plausible at SFU. It was already missing on the narrower
  // `tech` this widened.
  'digital\\s+literacy|computer\\s+(basics|skills|help)|\\btech(nology)?\\s+(cafe|help|support)',
  'device\\s+clinic|laptop\\s+help|online\\s+safety|internet\\s+basics',
  // Office suite. Libraries title these by product, not by the category words above, so the
  // group missed them entirely: NVCL's "MS Office learn and practice: Intro to Word" and
  // Surrey's office sessions. Every office word is QUALIFIED — behind `ms`, `microsoft`, or
  // `intro to` — because the bare forms are traps: `\bexcel\b` catches "Excel in Your
  // Studies", `\bword\b` catches "Crossword Club" and "Wordplay for Toddlers", and
  // `\bpowerpoint\b` catches "PowerPoint Karaoke Night". All four are real titles from the
  // live feeds. See lib/relevance_test.ts.
  '\\bms\\s+(office|word|excel|powerpoint|outlook)\\b',
  'microsoft\\s+(office|word|excel|powerpoint|outlook|365)\\b',
  'intro(duction)?\\s+to\\s+(excel|word|powerpoint|outlook)\\b|\\bspreadsheet',
];

// Default: settlement terms + digital literacy. Strict: settlement terms only. Alternation
// order does not affect a .test(), so the default union is functionally equivalent to the
// single array this replaced, apart from the intended `\b` additions above and the
// `digital`-guard on `literacy` — both leave every default verdict unchanged (re-verified
// against the captured corpus: zero flips on the non-strict sources).
const RELEVANCE_RE = new RegExp([...CORE_TERMS, ...DIGITAL_LITERACY_TERMS].join('|'), 'i');
const STRICT_RELEVANCE_RE = new RegExp(CORE_TERMS.join('|'), 'i');

/**
 * Whether a library/university event's title indicates settlement-relevant content. Pass
 * `{ strict: true }` (wired from `Source.strictRelevance`) to also drop generic
 * digital-literacy / tech-help content — see the header for why that is per-source.
 *
 * Note what is deliberately absent from CORE_TERMS: a bare `orientation` would catch West
 * Van's "Recording Studio Orientation", so SFU's flagship "International Student
 * Orientation" is caught by `international student` instead. Likewise bare `health`,
 * `family` and `community` are excluded as far too broad for a library calendar.
 */
export function isSettlementRelevant(title: string, opts?: { strict?: boolean }): boolean {
  const re = opts?.strict ? STRICT_RELEVANCE_RE : RELEVANCE_RE;
  return re.test(foldAccents(title));
}
