// Stored province value to canonical name (spec UnifyCN/web-app#177, ticket
// #181). The seam is canonicalProvince: any stored value in, one of the 13
// canonical names or null out. Every boundary (retrieval, pointer, profile
// context) reads this one function.
//
// RUN (from web-app/):
//   deno test --no-check supabase/functions/rag-query/lib/province_test.ts

import { assertEquals } from 'jsr:@std/assert@1';
import { CANADIAN_PROVINCES, canonicalProvince } from './province.ts';
import { buildRetrievalArgs } from './retrieval.ts';
import { provinceImmigrationPointer } from './provincePointer.ts';

// The 23 aliases of the mobile app (constants/LocationData.ts normalizeProvince).
const ALIASES: Record<string, string> = {
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

// Names every object inherits, in the spellings a stored free-text value can take.
const INHERITED = [
  'constructor',
  'Constructor',
  ' CONSTRUCTOR. ',
  '__proto__',
  'toString',
  'tostring',
  'valueOf',
  'valueof',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toLocaleString',
  '__defineGetter__',
  '__lookupGetter__',
];

Deno.test('all 13 canonical names and 23 aliases resolve, in any case, spacing or trailing period', () => {
  assertEquals(CANADIAN_PROVINCES.length, 13);
  assertEquals(Object.keys(ALIASES).length, 23);
  for (const name of CANADIAN_PROVINCES) {
    for (const input of [name, name.toUpperCase(), name.toLowerCase(), `  ${name}.  `]) {
      assertEquals(canonicalProvince(input), name, input);
    }
  }
  for (const [alias, name] of Object.entries(ALIASES)) {
    for (const input of [alias, alias.toUpperCase(), ` ${alias}. `]) {
      assertEquals(canonicalProvince(input), name, input);
    }
  }
  assertEquals(canonicalProvince('british   columbia'), 'British Columbia');
});

Deno.test('a name every object inherits is not a province: it resolves to null', () => {
  for (const input of INHERITED) {
    assertEquals(canonicalProvince(input), null, input);
  }
});

Deno.test('other unmatched, empty and non-text values resolve to null', () => {
  for (const input of ['Atlantis', 'Ontario; drop table', '', '   ', '.', null, undefined, 42, true, {}, [], ['Ontario']]) {
    assertEquals(canonicalProvince(input), null, JSON.stringify(input));
  }
});

Deno.test('the serialized retrieval body always carries five keys, null for an unmatched value', () => {
  for (const input of [...INHERITED, 'Atlantis', '', null, undefined]) {
    const body = JSON.parse(JSON.stringify(buildRetrievalArgs([0.1], { province: input })));
    assertEquals(Object.keys(body).sort(), ['filter_province', 'match_count', 'match_threshold', 'query_embedding', 'query_embedding_model'], String(input));
    assertEquals(body.filter_province, null, String(input));
    assertEquals(body.match_threshold, 0.3);
    assertEquals(body.match_count, 10);
  }
  const noProfile = JSON.parse(JSON.stringify(buildRetrievalArgs([0.1], null)));
  assertEquals(noProfile.filter_province, null);
});

Deno.test('an unmatched value gives no pointer and does not throw', () => {
  for (const input of [...INHERITED, 'Atlantis', '', null, undefined]) {
    assertEquals(provinceImmigrationPointer(input), '', String(input));
  }
});
