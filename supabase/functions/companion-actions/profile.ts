import { exactProvinceName } from '../rag-query/lib/context/placeNames.ts';

/** Existing profile owners only. Relative dates and unsupported fields never resolve. */
export type ProfileField = 'province' | 'arrival_date';
export interface ProfileOperation {
  type: 'profile.update';
  field: ProfileField;
  value: string | null;
  expected_revision: number;
}

export function profileValue(field: ProfileField, value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (field === 'province') return exactProvinceName(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && value >= '0001-01-01'
    ? value : null;
}

export function profileDateInRange(value: string, today = new Date()): boolean {
  const bound = (years: number) => {
    const year = today.getUTCFullYear() + years, month = today.getUTCMonth();
    const day = Math.min(today.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
    return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
  };
  return value >= bound(-5) && value <= bound(3);
}

/** A documented, anchored command grammar. Discussion text is never authorization. */
export function profileCommand(text: string):
  | { kind: 'profile'; field: ProfileField; value: string }
  | { kind: 'profile_clarify' }
  | null {
  const patterns: [ProfileField, RegExp][] = [
    ['province', /^update my profile province to (.+)$/iu],
    ['arrival_date', /^update my profile arrival date to (.+)$/iu],
    ['province', /^mets à jour la province de mon profil à (.+)$/iu],
    ['arrival_date', /^mets à jour la date d'arrivée de mon profil à (.+)$/iu],
    ['province', /^actualiza la provincia de mi perfil a (.+)$/iu],
    ['arrival_date', /^actualiza la fecha de llegada de mi perfil a (.+)$/iu],
    ['province', /^cập nhật tỉnh bang trong hồ sơ của tôi thành (.+)$/iu],
    ['arrival_date', /^cập nhật ngày đến trong hồ sơ của tôi thành (.+)$/iu],
    ['province', /^मेरी प्रोफ़ाइल का प्रांत (.+) करें$/u],
    ['arrival_date', /^मेरी प्रोफ़ाइल में आगमन की तारीख (.+) करें$/u],
    ['province', /^ਮੇਰੀ ਪ੍ਰੋਫ਼ਾਈਲ ਦਾ ਪ੍ਰਾਂਤ (.+) ਕਰੋ$/u],
    ['arrival_date', /^ਮੇਰੀ ਪ੍ਰੋਫ਼ਾਈਲ ਵਿੱਚ ਪਹੁੰਚਣ ਦੀ ਤਾਰੀਖ (.+) ਕਰੋ$/u],
    ['province', /^حدّ?ث مقاطعة ملفي الشخصي إلى (.+)$/u],
    ['arrival_date', /^حدّ?ث تاريخ الوصول في ملفي الشخصي إلى (.+)$/u],
  ];
  for (const [field, pattern] of patterns) {
    const exact = pattern.exec(text.trim());
    if (!exact) continue;
    const value = profileValue(field, exact[1].trim());
    return value && (field !== 'arrival_date' || profileDateInRange(value))
      ? { kind: 'profile', field, value } : { kind: 'profile_clarify' };
  }
  return /^(update my profile\b|mets à jour .*profil|actualiza .*perfil|cập nhật .*hồ sơ|मेरी प्रोफ़ाइल|ਮੇਰੀ ਪ੍ਰੋਫ਼ਾਈਲ|حدّ?ث .*ملفي)/iu.test(text.trim())
    ? { kind: 'profile_clarify' } : null;
}
