// Statements that belong to the profile, not to saved personal details (mobile-app#370).
//
// The onboarding profile owns where the user is (province, city), when they arrive and
// their immigration status (persona). A saved detail that states one of these would be a
// second, possibly conflicting copy, so the action service refuses it and says that a
// profile update is a separate action. The same check keeps rag-query from suggesting one.
//
// Deterministic and narrow, like conversationDetails.ts: places and arrival phrasings come
// from placeNames.ts (every supported app language and script); statuses from the short
// per-language lists below. A statement these lists do not recognise is not a profile
// fact here. This is not a general language parser.

import { arrivalIn, hasArrivalCue, placeIn } from './placeNames.ts';

/** Where the user is or is going (the profile's province and city), arrival, status. */
export type ProfileFactField = 'province' | 'arrival_date' | 'persona';

/** Immigration status words per supported language (en, fr, es, vi, hi, pa, ar). */
const STATUS: RegExp[] = [
  /\b(permanent resident|international student|refugee|asylum|temporary (foreign )?worker|work permit|study permit|citizenship status|immigration status)\b/i,
  /(?<!\p{L})(résident(e)? permanent(e)?|étudiant(e)? international(e)?|réfugié(e)?|permis de (travail|études)|statut d['’]immigration)(?!\p{L})/iu,
  /(?<!\p{L})(residente permanente|estudiante internacional|refugiad[oa]|permiso de (trabajo|estudio)|estatus migratorio)(?!\p{L})/iu,
  /(thường trú nhân|du học sinh|người tị nạn|giấy phép lao động|giấy phép du học)/iu,
  /(स्थायी निवासी|अंतरराष्ट्रीय छात्र|शरणार्थी|वर्क परमिट|स्टडी परमिट)/u,
  /(ਪੱਕਾ ਨਿਵਾਸੀ|ਪੱਕੇ ਨਿਵਾਸੀ|ਅੰਤਰਰਾਸ਼ਟਰੀ ਵਿਦਿਆਰਥੀ|ਸ਼ਰਨਾਰਥੀ|ਵਰਕ ਪਰਮਿਟ|ਸਟੱਡੀ ਪਰਮਿਟ)/u,
  /(مقيم دائم|إقامة دائمة|اقامة دائمة|طالب دولي|لاجئ|تصريح عمل|تصريح دراسة)/u,
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
