// Canadian place names and arrival times as users write them in every
// supported app language (en, fr, es, ar, hi, pa, vi), so a destination stated
// in Arabic, Devanagari or Gurmukhi script means the same as one in English.
//
// Matching is deterministic. Text in Arabic, Devanagari and Gurmukhi script is
// folded first (vowel marks, nasal marks, nukta and alef forms removed or
// unified), so common spelling variants of one name match. The lists cover the
// cities and provinces below and the common phrasings below; an unlisted place
// or phrasing produces no detail, as it does in English.

import type { CanadianProvince } from '../province.ts';

/** Fold Arabic, Devanagari and Gurmukhi spelling variants together. */
export function foldScript(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[ً-ْـٰ]/g, '') // Arabic vowel marks, tatweel
    .replace(/[آأإٱ]/g, 'ا') // alef forms -> alef
    .replace(/ى/g, 'ي') // alef maksura -> ya
    .replace(/[ँं़]/g, '') // Devanagari candrabindu, anusvara, nukta
    .replace(/ॉ/g, 'ो') // Devanagari candra o -> o
    .replace(/[ਂੰੱ਼]/g, '') // Gurmukhi bindi, tippi, addak, nukta
    .replace(/’/g, "'");
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A name in a non-Latin script, matched on folded text as a whole word.
 * Arabic attaches short prefixes (wa-, fa-, bi-, li-, ka-) to the next word;
 * the prefix is captured so "li-" (to) can mark a destination.
 */
function scriptName(name: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{M}])([وف]?[بلك]?)${escape(foldScript(name))}(?![\\p{L}\\p{M}])`, 'gu');
}

/** A Latin-script city name, case-sensitive as written (Regina, not regina). */
function latinCity(name: string): RegExp {
  return new RegExp(`(?<![\\p{L}])()${escape(name)}(?![\\p{L}])`, 'gu');
}

interface City {
  city: string;
  province: CanadianProvince;
  /** Other scripts and spellings. */
  other: string[];
}

// Names that are also common words in a language are left out of that
// language (for example Surrey in Arabic, "saari", which means "in force").
const CITIES: City[] = [
  { city: 'Vancouver', province: 'British Columbia', other: ['فانكوفر', 'فانكوڤر', 'वैंकूवर', 'वेंकूवर', 'वैनकूवर', 'ਵੈਨਕੂਵਰ', 'ਵੈਂਕੂਵਰ'] },
  { city: 'Surrey', province: 'British Columbia', other: ['सरे', 'ਸਰੀ'] },
  { city: 'Burnaby', province: 'British Columbia', other: ['برنابي', 'बर्नाबी', 'ਬਰਨਬੀ', 'ਬਰਨਾਬੀ'] },
  { city: 'Richmond', province: 'British Columbia', other: ['ريتشموند', 'रिचमंड', 'रिचमण्ड', 'ਰਿਚਮੰਡ'] },
  { city: 'Victoria', province: 'British Columbia', other: ['فيكتوريا', 'विक्टोरिया', 'ਵਿਕਟੋਰੀਆ'] },
  { city: 'Kelowna', province: 'British Columbia', other: ['كيلونا', 'केलोना', 'ਕਲੋਨਾ', 'ਕੇਲੋਨਾ'] },
  { city: 'Toronto', province: 'Ontario', other: ['تورونتو', 'تورنتو', 'تورانتو', 'टोरंटो', 'टोरोंटो', 'टोरन्टो', 'टोरांटो', 'ਟੋਰਾਂਟੋ', 'ਟਰਾਂਟੋ', 'ਟੋਰੰਟੋ', 'ਟਰੰਟੋ'] },
  { city: 'Ottawa', province: 'Ontario', other: ['أوتاوا', 'اوتاوا', 'ओटावा', 'ऑटवा', 'ਔਟਵਾ', 'ਓਟਾਵਾ'] },
  { city: 'Mississauga', province: 'Ontario', other: ['ميسيساغا', 'ميسيسوغا', 'मिसिसॉगा', 'मिसिसागा', 'ਮਿਸੀਸਾਗਾ'] },
  { city: 'Brampton', province: 'Ontario', other: ['برامبتون', 'ब्रैम्पटन', 'ब्रैम्प्टन', 'ब्रैंपटन', 'ਬਰੈਂਪਟਨ', 'ਬਰੈਮਪਟਨ', 'ਬ੍ਰੈਂਪਟਨ'] },
  { city: 'Hamilton', province: 'Ontario', other: ['هاميلتون', 'हैमिल्टन', 'ਹੈਮਿਲਟਨ'] },
  { city: 'Kitchener', province: 'Ontario', other: ['كيتشنر', 'किचनर', 'ਕਿਚਨਰ'] },
  { city: 'Waterloo', province: 'Ontario', other: ['واترلو', 'वाटरलू', 'ਵਾਟਰਲੂ'] },
  { city: 'Windsor', province: 'Ontario', other: ['وندسور', 'विंडसर', 'ਵਿੰਡਸਰ'] },
  { city: 'Montreal', province: 'Quebec', other: ['Montréal', 'مونتريال', 'मॉन्ट्रियल', 'मांट्रियल', 'ਮਾਂਟਰੀਅਲ', 'ਮੌਂਟਰੀਅਲ'] },
  { city: 'Quebec City', province: 'Quebec', other: ['مدينة كيبك', 'क्यूबेक सिटी', 'ਕਿਊਬੈਕ ਸਿਟੀ'] },
  { city: 'Laval', province: 'Quebec', other: ['لافال', 'लावल', 'ਲਾਵਲ'] },
  { city: 'Gatineau', province: 'Quebec', other: ['غاتينو', 'गैटिनो', 'ਗੈਟੀਨੋ'] },
  { city: 'Calgary', province: 'Alberta', other: ['كالغاري', 'كالجاري', 'कैलगरी', 'कैलगेरी', 'ਕੈਲਗਰੀ'] },
  { city: 'Edmonton', province: 'Alberta', other: ['إدمونتون', 'ادمونتون', 'एडमॉन्टन', 'एडमंटन', 'ਐਡਮਿੰਟਨ', 'ਐਡਮੰਟਨ'] },
  { city: 'Winnipeg', province: 'Manitoba', other: ['وينيبيغ', 'وينيبج', 'विनिपेग', 'ਵਿਨੀਪੈਗ'] },
  { city: 'Regina', province: 'Saskatchewan', other: ['ريجاينا', 'रेजिना', 'ਰਿਜਾਈਨਾ', 'ਰੇਜੀਨਾ'] },
  { city: 'Saskatoon', province: 'Saskatchewan', other: ['ساسكاتون', 'सस्काटून', 'ਸਸਕਾਟੂਨ'] },
  { city: 'Halifax', province: 'Nova Scotia', other: ['هاليفاكس', 'हैलिफ़ैक्स', 'हैलिफैक्स', 'ਹੈਲੀਫੈਕਸ'] },
  { city: 'Fredericton', province: 'New Brunswick', other: ['فريدريكتون', 'फ्रेडरिक्टन', 'ਫਰੈਡਰਿਕਟਨ'] },
  { city: 'Moncton', province: 'New Brunswick', other: ['مونكتون', 'मॉन्कटन', 'ਮੌਂਕਟਨ'] },
  { city: 'Charlottetown', province: 'Prince Edward Island', other: ['شارلوت تاون', 'शार्लटटाउन', 'ਸ਼ਾਰਲਟਟਾਊਨ'] },
  { city: "St. John's", province: 'Newfoundland and Labrador', other: ['سانت جونز', 'सेंट जॉन्स', 'ਸੇਂਟ ਜੌਨਜ਼'] },
  { city: 'Whitehorse', province: 'Yukon', other: ['وايتهورس', 'व्हाइटहॉर्स', 'ਵਾਈਟਹੌਰਸ'] },
  { city: 'Yellowknife', province: 'Northwest Territories', other: ['يلونايف', 'येलोनाइफ', 'ਯੈਲੋਨਾਈਫ'] },
  { city: 'Iqaluit', province: 'Nunavut', other: ['إيكالويت', 'इकालुइट', 'ਇਕਾਲੂਇਟ'] },
];

const CITY_MATCHERS = CITIES.map(c => ({
  city: c.city,
  province: c.province,
  latin: [c.city, ...c.other.filter(n => /^[\p{Script=Latin}\s.'-]+$/u.test(n))].map(latinCity),
  script: c.other.filter(n => !/^[\p{Script=Latin}\s.'-]+$/u.test(n)).map(scriptName),
}));

/** Latin-script province names (English, French, Spanish, Vietnamese use these). */
const PROVINCE_LATIN: Array<[RegExp, CanadianProvince]> = [
  [/\bBritish Columbia\b/i, 'British Columbia'],
  [/(?:^|[\s(,])B\.?C\.?(?=$|[\s),.!?])/, 'British Columbia'],
  [/(?<!\p{L})(Colombie[\s-]Britannique|Columbia Británica|Colombia Británica|Columbia thuộc Anh)(?!\p{L})/iu, 'British Columbia'],
  [/\bOntario\b/i, 'Ontario'],
  [/(?<!\p{L})Qu[eé]bec(?!\p{L})(?!\s+City)/iu, 'Quebec'],
  [/\bAlberta\b/i, 'Alberta'],
  [/\bManitoba\b/i, 'Manitoba'],
  [/\bSaskatchewan\b/i, 'Saskatchewan'],
  [/(?<!\p{L})(Nova Scotia|Nouvelle[\s-]Écosse|Nueva Escocia)(?!\p{L})/iu, 'Nova Scotia'],
  [/(?<!\p{L})(New Brunswick|Nouveau[\s-]Brunswick|Nuevo Brunswick)(?!\p{L})/iu, 'New Brunswick'],
  [/(?<!\p{L})(Prince Edward Island|PEI|Île[\s-]du[\s-]Prince[\s-]Édouard|Isla del Príncipe Eduardo)(?!\p{L})/iu, 'Prince Edward Island'],
  [/(?<!\p{L})(Newfoundland|Terre[\s-]Neuve|Terranova)(?!\p{L})/iu, 'Newfoundland and Labrador'],
  [/(?<!\p{L})(Northwest Territories|Territoires du Nord[\s-]Ouest|Territorios del Noroeste)(?!\p{L})/iu, 'Northwest Territories'],
  [/\bYukon\b/i, 'Yukon'],
  [/\bNunavut\b/i, 'Nunavut'],
];

const PROVINCE_SCRIPT: Array<[CanadianProvince, string[]]> = [
  ['British Columbia', ['كولومبيا البريطانية', 'ब्रिटिश कोलंबिया', 'ब्रिटिश कोलम्बिया', 'ਬ੍ਰਿਟਿਸ਼ ਕੋਲੰਬੀਆ', 'ਬਰਿਟਿਸ਼ ਕੋਲੰਬੀਆ']],
  ['Ontario', ['أونتاريو', 'انتاريو', 'ओंटारियो', 'ओन्टारियो', 'ऑन्टेरियो', 'ਓਨਟਾਰੀਓ', 'ਓਂਟਾਰੀਓ', 'ਉਂਟਾਰੀਓ']],
  ['Quebec', ['كيبك', 'كيبيك', 'क्यूबेक', 'क्विबेक', 'ਕਿਊਬੈਕ', 'ਕਿਊਬਿਕ']],
  ['Alberta', ['ألبرتا', 'अल्बर्टा', 'ਅਲਬਰਟਾ']],
  ['Manitoba', ['مانيتوبا', 'मैनिटोबा', 'ਮੈਨੀਟੋਬਾ']],
  ['Saskatchewan', ['ساسكاتشوان', 'सस्केचेवान', 'सस्काचेवान', 'ਸਸਕੈਚਵਨ', 'ਸਸਕੈਚੇਵਾਨ']],
  ['Nova Scotia', ['نوفا سكوشا', 'नोवा स्कोशिया', 'ਨੋਵਾ ਸਕੋਸ਼ੀਆ']],
  ['New Brunswick', ['نيو برونزويك', 'न्यू ब्रंसविक', 'ਨਿਊ ਬਰੰਸਵਿਕ']],
  ['Prince Edward Island', ['جزيرة الأمير إدوارد', 'प्रिंस एडवर्ड आइलैंड', 'ਪ੍ਰਿੰਸ ਐਡਵਰਡ ਆਈਲੈਂਡ']],
  ['Newfoundland and Labrador', ['نيوفاوندلاند', 'न्यूफ़ाउंडलैंड', 'ਨਿਊਫਾਊਂਡਲੈਂਡ']],
  ['Yukon', ['يوكون', 'युकोन', 'यूकॉन', 'ਯੂਕੋਨ']],
  ['Northwest Territories', ['الأقاليم الشمالية الغربية', 'नॉर्थवेस्ट टेरिटरीज़', 'ਨੌਰਥਵੈਸਟ ਟੈਰੀਟਰੀਜ਼']],
  ['Nunavut', ['نونافوت', 'नुनावुत', 'ਨੂਨਾਵੁਤ']],
];


// ---------------------------------------------------------------- destination
//
// A message can name several places: where the user comes from, where they
// live or lived, where family lives or they will visit, and where they are
// going. Each mention gets a role from the words right around it, in each
// supported language; the destination is then chosen by role, never by the
// order of the tables or of the sentence. Two different destinations (or two
// places with no role at all) are reported as unclear, so the answer asks.

interface Mention {
  start: number;
  end: number;
  city: string | null;
  province: CanadianProvince;
  /** Arabic prefix glued to the name ("l" = to). */
  prefix: string;
}

type Role = 'destination' | 'origin' | 'current' | 'other' | 'neutral';

const global = (r: RegExp) => new RegExp(r.source, r.flags.includes('g') ? r.flags : r.flags + 'g');
const PROVINCE_LATIN_G = PROVINCE_LATIN.map(([r, province]) => [global(r), province] as const);
const PROVINCE_SCRIPT_G = PROVINCE_SCRIPT.map(
  ([province, names]) => [province, names.map(scriptName)] as const
);

function mentionsIn(folded: string): Mention[] {
  const found: Mention[] = [];
  const collect = (pattern: RegExp, city: string | null, province: CanadianProvince, prefixed: boolean) => {
    for (const m of folded.matchAll(pattern)) {
      const index = m.index ?? 0;
      // Name matchers capture the glued Arabic prefix first; the province
      // regexes may start with a space or bracket instead.
      const prefix = prefixed ? m[1] ?? '' : '';
      const lead = prefixed ? prefix.length : /^[\s(,]*/.exec(m[0])![0].length;
      found.push({ start: index + lead, end: index + m[0].length, city, province, prefix });
    }
  };
  for (const c of CITY_MATCHERS) for (const r of [...c.latin, ...c.script]) collect(r, c.city, c.province, true);
  for (const [r, province] of PROVINCE_LATIN_G) collect(r, null, province, false);
  for (const [province, patterns] of PROVINCE_SCRIPT_G) for (const r of patterns) collect(r, null, province, true);
  // Overlaps ("Quebec City" and "Quebec"): keep the longer, earlier mention.
  found.sort((x, y) => x.start - y.start || (y.end - y.start) - (x.end - x.start));
  const kept: Mention[] = [];
  for (const m of found) {
    const last = kept[kept.length - 1];
    if (last && m.start < last.end) continue;
    kept.push(m);
  }
  return kept;
}

const CLAUSE_END = /[.;!?。،؛।\n]|(?<!\p{L})(but|mais|pero|لكن|लेकिन|ਪਰ|nhưng)(?!\p{L})/giu;

function clauseBefore(folded: string, start: number): string {
  let from = 0;
  for (const m of folded.slice(0, start).matchAll(CLAUSE_END)) from = (m.index ?? 0) + m[0].length;
  return folded.slice(from, start);
}

// Words right before a mention (prepositional languages) or right after it
// (Hindi, Punjabi postpositions), on folded text.
const OTHER_BEFORE: RegExp[] = [
  /\b(sister|brother|mother|father|mom|dad|parents|family|friends?|cousins?|uncle|aunt|relatives|husband|wife|partner|son|daughter)\b.*\b(lives?|living|stays?|staying|is|are|works?)\s+(in|at)\s+$/i,
  /\b(visit|visiting|see|trip to|vacation in|holiday in)\s+$/i,
  /(sœur|frère|mère|père|parents|famille|ami|amie|amis).*(habite|habitent|vit|vivent|est|sont)\s+(à|en|au)\s+$/iu,
  /(?<!\p{L})(visiter|rendre visite à|voir)\s+$/iu,
  /(hermana|hermano|madre|padre|padres|familia|amigo|amiga|amigos).*(vive|viven|está|están)\s+en\s+$/iu,
  /(?<!\p{L})(visitar|ver)\s+(a\s+)?$/iu,
  /(اختي|اخي|امي|ابي|والدي|والداي|عائلتي|صديقي|صديقتي|اقاربي).*(تعيش|يعيش|يعيشون|تسكن|يسكن|يسكنون)\s+في\s*$/u,
  /(زياره|ازور|لزياره)\s*$/u,
  /(chị gái|anh trai|em gái|em trai|bố mẹ|gia đình|bạn tôi|bạn của tôi).*(sống ở|đang ở|ở tại)\s+$/iu,
  /(?<!\p{L})(thăm|du lịch|đi chơi)\s+$/iu,
];
const FAMILY_HI_PA = /(बहन|भाई|मा|पिता|माता-पिता|परिवार|दोस्त|मित्र|रिश्तेदार|ਭੈਣ|ਭਰਾ|ਮਾ|ਪਿਤਾ|ਮਾਪੇ|ਪਰਿਵਾਰ|ਦੋਸਤ|ਰਿਸ਼ਤੇਦਾਰ)/u;
const LIVES_AFTER_HI_PA = /^\s*(मे रह|ਵਿਚ ਰਹਿ|ਚ ਰਹਿ)/u;
const VISIT_AFTER = /^\s*(घूमने|मिलने|ਘੁਮਣ|ਮਿਲਣ)/u;

const ORIGIN_BEFORE: RegExp[] = [
  /\b(from|leaving|left|out of|used to live in|lived in|was living in|grew up in)\s+$/i,
  /(?<!\p{L})(de|d'|depuis|quitte|quitter|quitté|j'habitais à|j'ai vécu à|vécu à)\s*$/iu,
  /(?<!\p{L})(de|desde|del|salgo de|viví en|vivía en)\s+$/iu,
  /(?<!\p{L})(من|مغادرا)\s*$/u,
  /(?<!\p{L})(từ|rời|rời khỏi|từng sống ở)\s+$/iu,
];
const ORIGIN_AFTER = /^\s*(से|ਤੋ)(?![\p{L}\p{M}])|^\s*(se|ton|toh)\b/iu;

const DESTINATION_BEFORE: RegExp[] = [
  /\b(will|'ll|plan to|planning to|going to|want to|intend to)\s+(live|settle|stay)\s+(in|at)\s+$/i,
  /\b(to|into|towards|arrive in|arriving in|arrive at|land in|landing in|settle in|settling in)\s+$/i,
];
const DESTINATION_BEFORE_OTHER: RegExp[] = [
  /(?<!\p{L})(à|au|aux|en|vers|pour|jusqu'à)\s+$/iu,
  /(?<!\p{L})(a|al|hacia|para|hasta)\s+$/iu,
  /(?<!\p{L})(الي|نحو)\s*$/u,
  /(?<!\p{L})(đến|tới|sang|về|vào|qua)\s+$/iu,
];
const DESTINATION_AFTER = /^\s*(मे|को|पहुच|आ रह|शिफ्ट|जा रह|ਵਿਚ|ਚ|ਨੂ|ਪਹੁਚ|ਆ ਰਹ|ਸ਼ਿਫਟ|ਜਾ ਰਹ)(?![\p{L}\p{M}])|^\s*(mein|me|vich|pahunch\w*|shift|ja)\b/iu;

const CURRENT_BEFORE: RegExp[] = [
  /\b(live|living|lives|based|staying|reside|residing|currently|now)\s+(in|at)\s+$/i,
  /(j'habite|je vis|habite|je suis)\s+(à|en|au)\s+$/iu,
  /(vivo|estoy|resido)\s+en\s+$/iu,
  /(اعيش|اسكن|اقيم)\s+في\s*$/u,
  /(đang sống ở|sống ở|đang ở)\s+$/iu,
];
const CURRENT_AFTER = /^\s*(मे रह|ਵਿਚ ਰਹਿ|ਚ ਰਹਿ)/u;

/** "or" (maybe) between two places: the second shares the first one's role. */
const OR_BEFORE = /(?<!\p{L})(or|ou|o|hoặc|hay|او|या|ਜਾ|ya)\s+(?:(maybe|perhaps|peut-être|quizás|tal vez|có thể|शायद|ਸ਼ਾਇਦ)\s+)?(?:(to|à|a|in|en|الي|đến)\s+)?$/iu;

/** The role of one mention from the words around it, ignoring "or". */
function ownRole(m: Mention, folded: string): Role {
  const clause = clauseBefore(folded, m.start);
  const near = clause.slice(-60);
  const after = folded.slice(m.end, m.end + 40);
  if (OTHER_BEFORE.some(r => r.test(near))) return 'other';
  if (FAMILY_HI_PA.test(clause) && LIVES_AFTER_HI_PA.test(after)) return 'other';
  if (VISIT_AFTER.test(after)) return 'other';
  if (ORIGIN_BEFORE.some(r => r.test(near)) || ORIGIN_AFTER.test(after)) return 'origin';
  if (DESTINATION_BEFORE[0].test(near)) return 'destination';
  if (CURRENT_BEFORE.some(r => r.test(near)) || CURRENT_AFTER.test(after)) return 'current';
  if (m.prefix.endsWith('ل')) return 'destination';
  if (DESTINATION_BEFORE.some(r => r.test(near)) || DESTINATION_BEFORE_OTHER.some(r => r.test(near))) return 'destination';
  if (DESTINATION_AFTER.test(after)) return 'destination';
  return 'neutral';
}

/**
 * Roles for all mentions. Places joined by "or" ("Toronto or Calgary",
 * "Toronto या कैलगरी") share one role: a destination if either is marked as
 * one, else the first one's role.
 */
function rolesOf(mentions: Mention[], folded: string): Role[] {
  const roles = mentions.map(m => ownRole(m, folded));
  // Groups of mentions joined by "or".
  let groupStart = 0;
  const settle = (from: number, to: number) => {
    const group = roles.slice(from, to + 1);
    if (group.length < 2 || group.includes('other')) return;
    const shared = group.includes('destination') ? 'destination' : group[0];
    for (let k = from; k <= to; k++) roles[k] = shared;
  };
  for (let i = 1; i <= mentions.length; i++) {
    const joined = i < mentions.length && OR_BEFORE.test(clauseBefore(folded, mentions[i].start).slice(-60));
    if (!joined) {
      settle(groupStart, i - 1);
      groupStart = i;
    }
  }
  return roles;
}

export interface Place {
  city: string | null;
  province: CanadianProvince | null;
  /** Two or more different provinces with no clear choice between them. */
  unclear: CanadianProvince[] | null;
}

/**
 * Where a message says the user is going, in any supported language: the
 * destinations if any are marked, else places with no role, else where the
 * user says they live now. Origins and family/visit places are never chosen.
 */
export function placeIn(text: string): Place {
  const folded = foldScript(text);
  const mentions = mentionsIn(folded);
  const roleList = rolesOf(mentions, folded);
  const roles = mentions.map((m, i) => ({ m, role: roleList[i] }));
  for (const role of ['destination', 'neutral', 'current'] as const) {
    const chosen = roles.filter(r => r.role === role).map(r => r.m);
    if (chosen.length === 0) continue;
    const provinces = [...new Set(chosen.map(m => m.province))];
    if (provinces.length > 1) return { city: null, province: null, unclear: provinces.slice(0, 4) };
    const cities = [...new Set(chosen.map(m => m.city).filter((c): c is string => c !== null))];
    return { city: cities.length === 1 ? cities[0] : null, province: provinces[0], unclear: null };
  }
  return { city: null, province: null, unclear: null };
}

// ---------------------------------------------------------------- arrival

/** Words that say the user is arriving or moving, per language (folded text). */
const ARRIVAL_CUES: RegExp[] = [
  /\b(arriv\w*|land\w*|moving|move|flying|fly|coming)\b/i,
  /(?<!\p{L})(arriv\p{L}*|déménag\p{L}*|m'install\p{L}*|lleg\p{L}*|mud(o|arme|ándome|aré|amos)|vuelo)(?!\p{L})/iu,
  /(اصل|نصل|وصول|انتقل|انتقال|ساسافر)/u,
  // Devanagari and Gurmukhi, folded (nasal marks removed).
  /(पहुच|आ रहा|आ रही|शिफ्ट)/u,
  /(ਪਹੁਚ|ਆ ਰਿਹਾ|ਆ ਰਹੀ|ਸ਼ਿਫਟ)/u,
  /\b(pahunch\w*|pohonch\w*|shift)\b/i,
  /(đến|chuyển|đặt chân|bay sang)/iu,
];

export function hasArrivalCue(text: string): boolean {
  const folded = foldScript(text);
  return ARRIVAL_CUES.some(r => r.test(folded));
}

/** Relative arrival times per language, matched on folded text. */
const ARRIVAL_TIMES: Array<[string, RegExp]> = [
  ['tomorrow', /\btomorrow\b/i],
  // "mañana" alone is tomorrow; "la/esta/por la mañana" is the morning. Hindi
  // and Punjabi "kal" mean both yesterday and tomorrow, so they are not used.
  ['tomorrow', /(?<!\p{L})(demain|ngày mai)(?!\p{L})|(?<!(?:la|esta)\s)(?<!\p{L})mañana(?!\p{L})|(?<!\p{L})(غدا|بكره|بكرة)(?!\p{L})/iu],
  ['next_week', /\bnext week\b/i],
  ['next_week', /(semaine prochaine|próxima semana|semana que viene|semana próxima|tuần tới|tuần sau|الاسبوع المقبل|الاسبوع القادم|अगले सप्ताह|अगले हफ्ते|ਅਗਲੇ ਹਫਤੇ)/iu],
  ['this_week', /\bthis week\b/i],
  ['this_week', /(cette semaine|esta semana|tuần này|هذا الاسبوع|इस सप्ताह|इस हफ्ते|ਇਸ ਹਫਤੇ)/iu],
  ['next_month', /\bnext month\b/i],
  ['next_month', /(mois prochain|próximo mes|mes que viene|tháng tới|tháng sau|الشهر المقبل|الشهر القادم|अगले महीने|ਅਗਲੇ ਮਹੀਨੇ)/iu],
];

/** "in 3 days", "dans 2 semaines", "en 10 días", "2 tuần nữa". */
const IN_N: Array<RegExp> = [
  /\bin (\d{1,2}) (day|days|week|weeks)\b/i,
  /(?<!\p{L})dans (\d{1,2}) (jour|jours|semaine|semaines)(?!\p{L})/iu,
  /(?<!\p{L})en (\d{1,2}) (día|días|semana|semanas)(?!\p{L})/iu,
  /(?<!\p{L})(\d{1,2}) (ngày|tuần) nữa(?!\p{L})/iu,
];

export interface ArrivalPhrase {
  phrase: string;
  /** Days from today: the earliest and latest date the phrase can mean. */
  minDays: number;
  maxDays: number;
}

const RANGES: Record<string, [number, number]> = {
  tomorrow: [1, 1],
  next_week: [1, 14],
  this_week: [0, 7],
  next_month: [14, 62],
};

export function arrivalIn(text: string): ArrivalPhrase | null {
  if (!hasArrivalCue(text)) return null;
  const folded = foldScript(text);
  for (const pattern of IN_N) {
    const m = pattern.exec(folded);
    if (!m) continue;
    const n = Number(m[1]);
    const weeks = /^(week|semaine|semana|tuần)/i.test(m[2]);
    const days = weeks ? n * 7 : n;
    return {
      phrase: weeks ? `in_weeks:${n}` : `in_days:${n}`,
      minDays: Math.max(0, days - 3),
      maxDays: days + 3,
    };
  }
  for (const [code, pattern] of ARRIVAL_TIMES) {
    if (pattern.test(folded)) {
      const [minDays, maxDays] = RANGES[code];
      return { phrase: code, minDays, maxDays };
    }
  }
  return null;
}
