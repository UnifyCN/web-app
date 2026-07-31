// Genre tagging. public.events.genre is a pre-existing shared column that both apps read.

import { GENRE_DESCRIPTION_SCAN_CHARS } from './constants.ts';
import type { EventGenre } from './types.ts';

// Ordered, first match wins, lowercase keywords.
// ORDER IS LOAD-BEARING:
//   - Employment precedes Language because S.U.C.C.E.S.S. titles all carry
//     "(English, Multilingual Translation Captions Available)" — matching Language
//     first would file every employment workshop under Language.
//   - Housing matches `housing`, never a bare `hous`, or "Belkin House" lands there.
//   - Employment precedes Family so "Foreign Credential Recognition … Family Medicine
//     Licensing" reads as a career event, not a family one.
// Verified against the 69 rows already crawled into prod: 69/69 classified, 0 fallthrough.
const GENRE_RULES: Array<[RegExp, EventGenre]> = [
  [
    /job|career|employ|resume|hiring|worksafe|workplace|interview|credential|licens|internationally (educated|trained)|profession|nurse|physician|labour market/,
    'Employment',
  ],
  [/english|\besl\b|\blinc\b|language|conversation circle|french|francais/, 'Language'],
  [/housing|rental|renting|tenant|landlord|lease|shelter|homeless/, 'Housing'],
  [
    /tax|bank|budget|financ|money|credit|benefit|insurance|pension|income|subsid|rrsp|tfsa|debt|saving/,
    'Finance',
  ],
  [
    /immigration|citizenship|permanent resident|pr card|work permit|study permit|sin card|legal|lawyer|notary|settlement|orientation|document|visa/,
    'Documentation',
  ],
  [
    /health|clinic|wellness|mental|counsel|cancer|screening|nutrition|dental|emotion|stress|mindful|yoga|tai chi|qi gong|exercise|fitness|walkathon|memory|dementia|therapy|doctor|medical|wellbeing/,
    'Health',
  ],
  [/famil|child|kid|parent|youth|toddler|baby|preschool|caregiver|prenatal|daycare/, 'Family'],
  [/digital|computer|tech|literacy|skill|training|course|tutor|school|scholarship/, 'Education'],
  // Last rule, so these keywords only ever catch events no earlier rule claimed. That's
  // why the loose recreational-outing terms (explore, market, tour) are safe here and
  // would not be higher up: "explore available pathways" and "labour market" already
  // belong to Employment by the time this runs.
  [
    /social|communit|cafe|café|club|dance|mahjong|party|celebrat|potluck|festival|connect|meetup|drop-?in|peer|volunteer|friend|game|craft|garden|coffee|lunch|dinner|cook|meal|kitchen|immigrant|refugee|newcomer|explore|tour\b|trip\b|outing|excursion|museum|farm|winery|orchard|hike|picnic|market|sightsee/,
    'Socials',
  ],
];

function matchGenre(text: string): EventGenre | null {
  for (const [re, genre] of GENRE_RULES) {
    if (re.test(text)) return genre;
  }
  return null;
}

/**
 * Two passes: the title first, then the description as a tiebreaker. Title-only leaves
 * opaque names ("QUEST+", "Seniors First BC", "Senior Farsi & Dari Program")
 * uncategorized; matching both at once lets description boilerplate outvote a clear title
 * signal. Running the description only when the title says nothing gets both — on the 69
 * rows already in prod just 5 fall through to the second pass.
 */
export function genreForEvent(title: string, description: string | null): EventGenre {
  return (
    matchGenre(title.toLowerCase()) ??
    matchGenre((description ?? '').slice(0, GENRE_DESCRIPTION_SCAN_CHARS).toLowerCase()) ??
    'Uncategorized'
  );
}
