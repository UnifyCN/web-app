// An official immigration pointer for the user's province or territory, added
// to the answer prompt. Ontario, British Columbia and Alberta have a nominee
// program page in the knowledge base (mobile-app seed_province_crawl_sources).
// The other regions get their own official page instead, so the model never
// answers a provincial question from memory or with another province's rules.
// Quebec and Nunavut are not nominee programs and are worded separately.
// No province (or one that is not recognised) gives no pointer.
import { canonicalProvince, type CanadianProvince } from './province.ts';

type Entry =
  | { kind: 'ingested'; program: string; url: string }
  | { kind: 'nominee'; program: string; url: string }
  | { kind: 'quebec'; program: string; url: string }
  | { kind: 'nunavut'; program: string; url: string };

// Every URL was opened and read on 2026-10-23 or 2026-10-24 (see report-181.md).
const POINTERS: Record<CanadianProvince, Entry> = {
  Alberta: {
    kind: 'ingested',
    program: 'Alberta Advantage Immigration Program (AAIP)',
    url: 'https://www.alberta.ca/alberta-advantage-immigration-program',
  },
  'British Columbia': {
    kind: 'ingested',
    program: 'BC Provincial Nominee Program (BC PNP)',
    url: 'https://www.welcomebc.ca/immigrate-to-b-c/about-the-bc-provincial-nominee-program',
  },
  Manitoba: {
    kind: 'nominee',
    program: 'Manitoba Provincial Nominee Program (MPNP)',
    url: 'https://immigratemanitoba.com/',
  },
  'New Brunswick': {
    kind: 'nominee',
    program: 'New Brunswick Provincial Nominee Program (NBPNP)',
    url: 'https://www.gnb.ca/en/topic/family-home-community/immigration/provincial-nominee-program.html',
  },
  'Newfoundland and Labrador': {
    kind: 'nominee',
    program: 'Newfoundland and Labrador Provincial Nominee Program (NLPNP)',
    url: 'https://www.gov.nl.ca/immigration/',
  },
  'Northwest Territories': {
    kind: 'nominee',
    program: 'Northwest Territories Nominee Program (NWT NP)',
    url: 'https://www.immigratenwt.ca/',
  },
  'Nova Scotia': {
    kind: 'nominee',
    program: 'Nova Scotia Nominee Program (NSNP)',
    url: 'https://liveinnovascotia.com/',
  },
  Nunavut: {
    kind: 'nunavut',
    program: 'Immigrate to Nunavut',
    url: 'https://www.gov.nu.ca/en/immigration/immigrate-nunavut',
  },
  Ontario: {
    kind: 'ingested',
    program: 'Ontario Immigrant Nominee Program (OINP)',
    url: 'https://www.ontario.ca/page/ontario-immigrant-nominee-program-oinp',
  },
  'Prince Edward Island': {
    kind: 'nominee',
    program: 'Prince Edward Island Provincial Nominee Program (PEI PNP)',
    url: 'https://www.princeedwardisland.ca/en/topic/office-immigration',
  },
  Quebec: {
    kind: 'quebec',
    program: 'Immigration Québec',
    url: 'https://www.quebec.ca/en/immigration',
  },
  Saskatchewan: {
    kind: 'nominee',
    program: 'Saskatchewan Immigrant Nominee Program (SINP)',
    url: 'https://www.saskatchewan.ca/residents/moving-to-saskatchewan/live-in-saskatchewan/by-immigrating/saskatchewan-immigrant-nominee-program',
  },
  Yukon: {
    kind: 'nominee',
    program: 'Yukon Nominee Program (YNP)',
    url: 'https://yukon.ca/en/immigration/apply-immigrate-yukon/immigrate-yukon',
  },
};

export function provinceImmigrationPointer(province: unknown): string {
  const name = canonicalProvince(province);
  if (!name) return '';
  const entry = POINTERS[name];
  const head = `\nPROVINCE IMMIGRATION POINTER:\nThe user's province is ${name}.`;

  switch (entry.kind) {
    case 'ingested':
      return `${head} The ${entry.program} page is in the knowledge base. For provincial nominee questions, use it and give its "as of" date. If no knowledge base entry above covers the question, say current details are not available here and point to the official page: ${entry.url}`;
    case 'nominee':
      return `${head} The knowledge base has no ${name} nominee program source. For ${name} nominee program questions (streams, draws, fees, eligibility, openings), do not answer from memory and do not use another province's rules. Say current details are not available here and point to the official ${entry.program} page: ${entry.url}`;
    case 'quebec':
      return `${head} Quebec selects its own economic immigrants and is not part of the provincial nominee program (PNP) system, so do not describe Quebec programs as a PNP. The knowledge base has no Quebec immigration program source: do not answer Quebec program details from memory. Point to the official page: ${entry.url}`;
    case 'nunavut':
      return `${head} Nunavut has no separate immigration pathway and no nominee program, so do not invent one. The federal immigration pathways apply. Point to the official Nunavut page, which links to them: ${entry.url}`;
  }
}
