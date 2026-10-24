// Canonical province and territory names, and the alias table that maps stored
// values to them. Ported from the mobile app (constants/LocationData.ts,
// `normalizeProvince`): the shared `user_onboarding_profiles.province` column
// holds both "ON" and "Ontario" in production.
//
// Unlike mobile, an unrecognised value maps to null (never the raw text). The
// result feeds match_chunks.filter_province, which accepts only these 13 names.

export const CANADIAN_PROVINCES = [
  'Alberta',
  'British Columbia',
  'Manitoba',
  'New Brunswick',
  'Newfoundland and Labrador',
  'Northwest Territories',
  'Nova Scotia',
  'Nunavut',
  'Ontario',
  'Prince Edward Island',
  'Quebec',
  'Saskatchewan',
  'Yukon',
] as const;

export type CanadianProvince = (typeof CANADIAN_PROVINCES)[number];

const PROVINCE_ALIASES: Record<string, CanadianProvince> = {
  ab: 'Alberta',
  bc: 'British Columbia',
  mb: 'Manitoba',
  nb: 'New Brunswick',
  nl: 'Newfoundland and Labrador',
  nfld: 'Newfoundland and Labrador',
  newfoundland: 'Newfoundland and Labrador',
  nt: 'Northwest Territories',
  nwt: 'Northwest Territories',
  ns: 'Nova Scotia',
  nu: 'Nunavut',
  on: 'Ontario',
  ont: 'Ontario',
  pe: 'Prince Edward Island',
  pei: 'Prince Edward Island',
  qc: 'Quebec',
  pq: 'Quebec',
  québec: 'Quebec',
  sk: 'Saskatchewan',
  sask: 'Saskatchewan',
  yt: 'Yukon',
  yukon: 'Yukon',
  'yukon territory': 'Yukon',
};

const PROVINCE_BY_LOWER: Record<string, CanadianProvince> = Object.fromEntries(
  CANADIAN_PROVINCES.map(p => [p.toLowerCase(), p])
);

/** The canonical name for a stored province value, or null when there is none. */
export function canonicalProvince(value: unknown): CanadianProvince | null {
  if (typeof value !== 'string') return null;
  const key = value.trim().toLowerCase().replace(/\s+/g, ' ').replace(/\.$/, '');
  if (key === '') return null;
  return PROVINCE_BY_LOWER[key] ?? PROVINCE_ALIASES[key] ?? null;
}
