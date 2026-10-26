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
 * Arabic attaches short prefixes (wa-, fa-, bi-, li-, ka-) to the next word.
 */
function scriptName(name: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{M}])(?:[وف]?[بلك]?)${escape(foldScript(name))}(?![\\p{L}\\p{M}])`, 'u');
}

/** A Latin-script city name, case-sensitive as written (Regina, not regina). */
function latinCity(name: string): RegExp {
  return new RegExp(`(^|[^\\p{L}])${escape(name)}(?![\\p{L}])`, 'u');
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

const PROVINCE_SCRIPT_MATCHERS = PROVINCE_SCRIPT.map(
  ([province, names]) => [province, names.map(scriptName)] as const
);

/**
 * The Canadian city and/or province a message names, in any supported
 * language. A city wins over a province name; within each, the table order.
 */
export function placeIn(text: string): { city: string | null; province: CanadianProvince | null } {
  const folded = foldScript(text);
  for (const m of CITY_MATCHERS) {
    if (m.latin.some(r => r.test(text)) || m.script.some(r => r.test(folded))) {
      return { city: m.city, province: m.province };
    }
  }
  for (const [pattern, province] of PROVINCE_LATIN) {
    if (pattern.test(text)) return { city: null, province };
  }
  for (const [province, patterns] of PROVINCE_SCRIPT_MATCHERS) {
    if (patterns.some(r => r.test(folded))) return { city: null, province };
  }
  return { city: null, province: null };
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
