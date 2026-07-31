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
// Measured keep-rates on the live feeds when this landed (2026-07-31):
//   West Van 8/50 · VPL 6/100 · SFU 5/200 · NVDPL 16/100 · Surrey 2/10 (page 1)

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
 * Grouped for reviewability — the groups are purely documentation, the union is what
 * runs. Terms are matched case-insensitively against the accent-folded title.
 */
const RELEVANCE_RE = new RegExp(
  [
    // Status & settlement
    'newcomer|immigrant|immigration|refugee|asylum|settlement|migrant|international\\s+student',
    // Legal & documents
    'citizenship|permanent\\s+resident|pr\\s+card|work\\s+permit|study\\s+permit|visa\\b',
    'social\\s+insurance|sin\\s+clinic|legal\\s+clinic|notary',
    // Language
    '\\besl\\b|\\blinc\\b|english\\s+(conversation|class|corner|practice|language)',
    'conversation\\s+(circle|club|cafe)|language\\s+(exchange|cafe)|speaking\\s+english|literacy',
    // Employment
    'job\\s+(search|fair|club|help)|resume|cover\\s+letter|interview\\s+skills|career',
    'employment|workbc|hiring|credential|foreign[-\\s]trained|workplace',
    // Finance
    'tax\\s+clinic|income\\s+tax|banking|bank\\s+account|budgeting|financial\\s+literacy',
    'credit\\s+score',
    // Housing
    'housing|tenant|tenancy|rental|renting|landlord|lease\\b',
    // Digital literacy
    'digital\\s+literacy|computer\\s+(basics|skills|help)|tech\\s+(cafe|help|support)',
    'device\\s+clinic|online\\s+safety|internet\\s+basics',
    // Health-system navigation
    'health\\s+card|family\\s+doctor|\\bmsp\\b|medical\\s+insurance',
  ].join('|'),
  'i',
);

/**
 * Whether a library/university event's title indicates settlement-relevant content.
 *
 * Note what is deliberately absent: a bare `orientation` would catch West Van's
 * "Recording Studio Orientation", so SFU's flagship "International Student Orientation"
 * is caught by `international student` instead. Likewise bare `health`, `family` and
 * `community` are excluded as far too broad for a library calendar.
 */
export function isSettlementRelevant(title: string): boolean {
  return RELEVANCE_RE.test(foldAccents(title));
}
