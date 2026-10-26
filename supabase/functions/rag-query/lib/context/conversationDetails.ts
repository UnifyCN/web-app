// Details the user states in the conversation ("I arrive in Vancouver next
// week"), and how they compare with the saved profile.
//
// These details steer this one answer. They are never written anywhere: the
// profile keeps province and arrival date (spec #359, "existing profile fields
// remain authoritative"), and saved personal details need the user's approval
// (a later ticket). When a stated detail differs from the profile, or a
// planning question has no province at all, the answer asks instead of
// guessing.
//
// Matching is deterministic. Stated places and arrival times are read in every
// supported app language and script (placeNames.ts): the listed Canadian
// cities and provinces and common arrival phrasings. An unlisted place or
// phrasing produces no detail, so the answer falls back to the profile.
// Planning questions (which trigger the official-guidance check) are
// recognised in every supported app language from per-language word lists;
// those lists cover common phrasings, not every way to ask.

import type { Clarification, ConversationDetailItem } from './contract.ts';
import { canonicalProvince, type CanadianProvince } from '../province.ts';
import { parseUtcDate, formatIsoDate } from '../dates.ts';
import { arrivalIn, placeIn, type ArrivalPhrase } from './placeNames.ts';

/**
 * Questions about what to do next, where settlement steps depend on place:
 * arriving or moving, first or next steps, where to start, how to apply or
 * register, which documents are needed. One list per supported app language
 * (en, fr, es, ar, hi, pa, vi) plus romanised Hindi/Punjabi, all checked on
 * every question, so a mixed-language question matches too.
 */
const PLANNING_PATTERNS: RegExp[] = [
  // English
  /\b(next steps?|first (week|weeks|days?|month|steps?)|plan|arriv\w*|land(ing)? in|moving to|settl\w*|what should i do|where (do|should) i start|get started|how (do|can|should) i (get|apply|open|register|sign up|find)|requirements?|documents? (do )?i need)\b/i,
  // French
  /(?<!\p{L})(arriv\p{L}*|prochaines? étapes?|premières? étapes?|en premier|par où commencer|m['’]install\p{L}*|déménag\p{L}*|démarches?|que dois-je faire|comment (obtenir|demander|ouvrir|m['’]inscrire)|quels documents|exigences)(?!\p{L})/iu,
  // Spanish
  /(?<!\p{L})(lleg\p{L}*|mud(o|arme|ándome|aré|amos)|primeros pasos|próximos pasos|siguientes pasos|qué (debo|tengo que) hacer|qué hago primero|por dónde (empiezo|empezar)|cómo (solicito|obtengo|abro|me registro|consigo|tramito)|qué documentos|requisitos|establecerme|instalarme)(?!\p{L})/iu,
  // Arabic (prefixes attach to words, so these match inside words)
  /(سأصل|أصل إلى|نصل|الوصول|وصولي|وصلت|سأنتقل|أنتقل|انتقالي|الانتقال|ماذا يجب أن أفعل|ماذا أفعل أول|الخطوات الأولى|الخطوات التالية|من أين أبدأ|كيف أحصل|كيف أقدم|كيف أفتح|كيف أسجل|المستندات المطلوبة|الوثائق المطلوبة|الاستقرار)/u,
  // Hindi
  /(पहुँच|पहुंच|आ रहा हूँ|आ रही हूँ|आ रहा हूं|आ रही हूं|शिफ्ट|पहले क्या|अगले कदम|पहले कदम|शुरुआत कहाँ|शुरुआत कहां|कहाँ से शुरू|कहां से शुरू|कैसे आवेदन|कौन से दस्तावेज़|कौन से दस्तावेज|बसने)/u,
  // Punjabi (Gurmukhi)
  /(ਪਹੁੰਚ|ਆ ਰਿਹਾ|ਆ ਰਹੀ|ਸ਼ਿਫਟ|ਪਹਿਲਾਂ ਕੀ|ਅਗਲੇ ਕਦਮ|ਪਹਿਲੇ ਕਦਮ|ਸ਼ੁਰੂਆਤ ਕਿੱਥੋਂ|ਕਿੱਥੋਂ ਸ਼ੁਰੂ|ਕਿਵੇਂ ਅਪਲਾਈ|ਕਿਹੜੇ ਦਸਤਾਵੇਜ਼|ਵਸਣ)/u,
  // Romanised Hindi / Punjabi
  /\b(pahunch\w*|pohonch\w*|pehle kya|pehlan ki|pehle ki|agle kadam|shuru kahan)\b/i,
  // Vietnamese
  /(sẽ đến|đặt chân|chuyển đến|chuyển tới|chuyển sang|làm gì đầu tiên|làm gì trước|bước đầu tiên|bước tiếp theo|bắt đầu từ đâu|làm thế nào để (đăng ký|xin|mở|nhận)|cần những giấy tờ|giấy tờ gì|định cư|ổn định cuộc sống)/iu,
];

export function isPlanningQuestion(prompt: string): boolean {
  const text = prompt.normalize('NFC');
  return PLANNING_PATTERNS.some(pattern => pattern.test(text));
}

/**
 * Locale-neutral arrival code: `tomorrow`, `this_week`, `next_week`,
 * `next_month`, `in_days:<n>` or `in_weeks:<n>`. Clients translate it; the
 * prompt spells it in English (arrivalWords).
 */
export type ArrivalCode = string;

export interface ConversationDetails {
  item: ConversationDetailItem | null;
  /** Province the user stated in this conversation, if any. */
  province: CanadianProvince | null;
  arrival: ArrivalPhrase | null;
}

/**
 * Details stated in the current message, else in the latest earlier user turn
 * that states one (the client sends the recent turns).
 */
export function readConversationDetails(
  prompt: string,
  earlierUserTurns: string[]
): ConversationDetails {
  const turns = [prompt, ...earlierUserTurns.slice(-3).reverse()];
  let place: { city: string | null; province: CanadianProvince | null } = { city: null, province: null };
  let arrival: ArrivalPhrase | null = null;
  for (const turn of turns) {
    if (typeof turn !== 'string') continue;
    const text = turn.slice(0, 2000);
    if (!place.province) place = placeIn(text);
    if (!arrival) arrival = arrivalIn(text);
  }
  const fields: ConversationDetailItem['fields'] = [];
  if (place.city) fields.push({ key: 'city', value: place.city });
  if (place.province) fields.push({ key: 'province', value: place.province });
  if (arrival) fields.push({ key: 'arrival', value: arrival.phrase });
  return {
    item: fields.length > 0 ? { kind: 'conversation_detail', saved: false, fields } : null,
    province: place.province,
    arrival,
  };
}

/** The English words for an arrival code, for the prompt. */
export function arrivalWords(code: string): string {
  const n = /^in_(days|weeks):(\d{1,2})$/.exec(code);
  if (n) return `in ${n[2]} ${n[1]}`;
  return code.replace('_', ' ');
}

const DAY_MS = 86_400_000;

/**
 * What the answer must ask about: a stated province or arrival time that
 * differs from the profile, or a planning question with no province at all.
 * Province conflicts come first.
 */
export function clarificationFor(
  details: ConversationDetails,
  profile: Record<string, unknown> | null,
  prompt: string,
  now: Date
): Clarification | null {
  const profileProvince = canonicalProvince(profile?.province);
  if (details.province && profileProvince && details.province !== profileProvince) {
    return {
      kind: 'profile_conflict',
      field: 'province',
      profileValue: profileProvince,
      conversationValue: details.province,
    };
  }
  const profileArrival = parseUtcDate(profile?.arrival_date);
  if (details.arrival && profileArrival) {
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const arrivalMs = Date.UTC(profileArrival.year, profileArrival.month - 1, profileArrival.day);
    const days = Math.round((arrivalMs - today) / DAY_MS);
    if (days < details.arrival.minDays || days > details.arrival.maxDays) {
      return {
        kind: 'profile_conflict',
        field: 'arrival_date',
        profileValue: formatIsoDate(profileArrival),
        conversationValue: details.arrival.phrase,
      };
    }
  }
  if (!details.province && !profileProvince && isPlanningQuestion(prompt)) {
    return { kind: 'missing', field: 'province' };
  }
  return null;
}

/** The province this answer is about: stated in the conversation, else the profile's. */
export function effectiveProvince(
  details: ConversationDetails,
  profile: Record<string, unknown> | null
): CanadianProvince | null {
  return details.province ?? canonicalProvince(profile?.province);
}
