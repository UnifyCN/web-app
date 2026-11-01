// Statements that belong to the profile, not to saved personal details (mobile-app#370).
//
// The onboarding profile owns where the user is (province, city), when they arrive and
// their immigration status (persona). A saved detail that states one of these would be a
// second, possibly conflicting copy, so the action service refuses it and says that a
// profile update is a separate action. The same check keeps rag-query from suggesting one.
//
// Deterministic and narrow, like conversationDetails.ts: places and arrival phrasings come
// from placeNames.ts (every supported app language and script); statuses from the short
// per-language words and statement frames below. A statement these lists do not recognise
// is not a profile fact here. This is not a general language parser.

import { arrivalIn, hasArrivalCue, placeIn } from './placeNames.ts';

/** Where the user is or is going (the profile's province and city), arrival, status. */
export type ProfileFactField = 'province' | 'arrival_date' | 'persona';

// A status word alone is not a status statement: "an interpreter for work permit
// appointments" states a need, not the user's status (S370-2). A statement counts when it
// says the user is or holds that status, in that language's short frame: a first-person
// "I am / I have / I came as" before the word (en, fr, es, vi, ar), the word before a copula
// ("… हूँ", "… ਹਾਂ") in hi and pa, "my immigration status is …", or the bare word alone.

/** Immigration status words per supported language. */
const WORDS = {
  en: String.raw`permanent resident|international student|refugee|asylum|temporary (?:foreign )?worker|work permit|study permit`,
  fr: String.raw`résident(?:e)? permanent(?:e)?|étudiant(?:e)? international(?:e)?|réfugié(?:e)?|permis de (?:travail|études)`,
  es: String.raw`residente permanente|estudiante internacional|refugiad[oa]|permiso de (?:trabajo|estudio)`,
  vi: String.raw`thường trú nhân|du học sinh|người tị nạn|giấy phép lao động|giấy phép du học`,
  hi: String.raw`स्थायी निवासी|अंतरराष्ट्रीय छात्र|शरणार्थी|वर्क परमिट|स्टडी परमिट`,
  pa: String.raw`ਪੱਕਾ ਨਿਵਾਸੀ|ਪੱਕੇ ਨਿਵਾਸੀ|ਅੰਤਰਰਾਸ਼ਟਰੀ ਵਿਦਿਆਰਥੀ|ਸ਼ਰਨਾਰਥੀ|ਵਰਕ ਪਰਮਿਟ|ਸਟੱਡੀ ਪਰਮਿਟ`,
  ar: String.raw`مقيم دائم|إقامة دائمة|اقامة دائمة|طالب دولي|لاجئ|تصريح عمل|تصريح دراسة`,
};
const ALL_WORDS = Object.values(WORDS).join('|');
const NOT_LETTER_BEFORE = String.raw`(?<!\p{L})`;
const NOT_LETTER_AFTER = String.raw`(?![\p{L}\p{M}])`;

/** "I am / I have / I came as" + a few filler words + a status word, per language. */
const framed = (frame: string, filler: string, words: string, after = '') =>
  new RegExp(`${NOT_LETTER_BEFORE}(?:${frame})(?:\\s+(?:${filler}))*\\s+(?:${words})${NOT_LETTER_AFTER}${after}`, 'iu');

const STATUS: RegExp[] = [
  framed(
    String.raw`i\s+am|i['’]m|im|we\s+are|we['’]re|i\s+(?:have|hold|got|received|was\s+granted|became)|i['’]ve|i\s+(?:came|moved|live|work|study)(?:\s+(?:here|to\s+canada|in\s+canada))?\s+(?:as|on)`,
    String.raw`a|an|the|my|our|now|currently|still|already|just|recently|officially|also|here|on|got|seeking|claiming`,
    WORDS.en,
    // The word naming something else: "a work permit appointment" is not a status.
    String.raw`(?!\s+(?:holder\s+)?(?:appointments?|applications?|renewals?|extensions?|interviews?|offices?|forms?|fees?|hearings?|paperwork|documents?|process(?:ing)?|questions?|deadlines?|requirements?|letters?)(?!\p{L}))`,
  ),
  framed(
    String.raw`je\s+suis|j['’]ai|nous\s+sommes|nous\s+avons|en\s+tant\s+que`,
    String.raw`un|une|le|la|mon|ma|maintenant|déjà|actuellement|encore|aussi|titulaire\s+d['’]une?|titulaire\s+du`,
    WORDS.fr,
  ),
  framed(
    String.raw`soy|somos|tengo|tenemos|estoy\s+con|(?:vivo|trabajo|estudio|vine|llegué)(?:\s+aquí)?\s+como`,
    String.raw`un|una|el|la|mi|ya|ahora|actualmente|también|todavía|aún|titular\s+de(?:l|\s+una?)?`,
    WORDS.es,
  ),
  framed(
    String.raw`(?:tôi|chúng tôi|mình|em|tớ)\s+(?:(?:hiện|đang|đã|vẫn)\s+)?(?:là|có|được cấp)`,
    String.raw`một|là|có`,
    WORDS.vi,
  ),
  framed(
    String.raw`أنا|انا|نحن|لدي|لديّ|عندي|معي|إنني|انني|أنني|بصفتي|كوني`,
    String.raw`الآن|حاليًا|حاليا|أيضًا|أيضا|حاصل\s+على|حاصلة\s+على`,
    WORDS.ar,
  ),
  // hi, pa: the word, then the copula.
  new RegExp(`(?:${WORDS.hi})(?:\\s+(?:पर|धारक|होल्डर))?\\s+(?:हूँ|हूं|हैं|है|था|थी|थे)${NOT_LETTER_AFTER}`, 'u'),
  new RegExp(`(?:${WORDS.pa})(?:\\s+(?:ਉੱਤੇ|ਤੇ|ਧਾਰਕ|ਹੋਲਡਰ))?\\s+(?:ਹਾਂ|ਹੈ|ਹਨ|ਸੀ)${NOT_LETTER_AFTER}`, 'u'),
  // "My immigration status is …", in each language that names the category.
  new RegExp(String.raw`${NOT_LETTER_BEFORE}(?:my\s+(?:immigration|citizenship)\s+status\s*(?:is|was|:)|mon\s+statut\s+d['’]immigration\s*(?:est|:)|mi\s+estatus\s+migratorio\s*(?:es|:))`, 'iu'),
  // The bare status, optionally with its article and holder word.
  new RegExp(`^(?:(?:a|an|un|une|una|el|la|le)\\s+)?(?:${ALL_WORDS})(?:\\s+(?:holder|claimant|seeker))?[.!।]*$`, 'iu'),
];

/** A date written with digits or a month name, next to an arrival word. */
const DATE_HINT = /\d|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|tháng/iu;

/** The profile field a statement duplicates, or null when it is not a profile fact. */
export function profileFactOf(text: string): ProfileFactField | null {
  const t = text.normalize('NFC');
  const place = placeIn(t);
  if (place.province || place.unclear) return 'province';
  if (arrivalIn(t) || (hasArrivalCue(t) && DATE_HINT.test(t))) return 'arrival_date';
  if (STATUS.some(r => r.test(t))) return 'persona';
  return null;
}
