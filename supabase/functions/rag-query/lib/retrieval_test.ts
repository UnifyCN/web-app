// Profile to retrieval arguments (spec UnifyCN/web-app#177, ticket #181).
// The seam is buildRetrievalArgs: the profile row and the query vector go in,
// the exact match_chunks RPC body comes out.
//
// RUN (from web-app/):
//   deno test --no-check supabase/functions/rag-query/lib/retrieval_test.ts

import { assertEquals } from 'jsr:@std/assert@1';
import { buildRetrievalArgs } from './retrieval.ts';

const VECTOR = [0.1, 0.2, 0.3];

function args(province: unknown) {
  return buildRetrievalArgs(VECTOR, { province });
}

Deno.test('Ontario: all four arguments, threshold 0.3 and count 10 unchanged', () => {
  assertEquals(args('Ontario'), {
    query_embedding: VECTOR,
    match_threshold: 0.3,
    match_count: 10,
    filter_province: 'Ontario',
  });
});

Deno.test('aliases and spellings reach the canonical name', () => {
  const cases: Array<[string, string]> = [
    ['ON', 'Ontario'],
    ['  ontario ', 'Ontario'],
    ['Ont.', 'Ontario'],
    ['bc', 'British Columbia'],
    ['AB', 'Alberta'],
    ['MB', 'Manitoba'],
    ['nb', 'New Brunswick'],
    ['NL', 'Newfoundland and Labrador'],
    ['NFLD', 'Newfoundland and Labrador'],
    ['Newfoundland', 'Newfoundland and Labrador'],
    ['NT', 'Northwest Territories'],
    ['nwt', 'Northwest Territories'],
    ['NS', 'Nova Scotia'],
    ['NU', 'Nunavut'],
    ['PE', 'Prince Edward Island'],
    ['PEI', 'Prince Edward Island'],
    ['QC', 'Quebec'],
    ['PQ', 'Quebec'],
    ['Québec', 'Quebec'],
    ['SK', 'Saskatchewan'],
    ['Sask', 'Saskatchewan'],
    ['YT', 'Yukon'],
    ['Yukon Territory', 'Yukon'],
    ['british  columbia', 'British Columbia'],
  ];
  for (const [raw, canonical] of cases) {
    assertEquals(args(raw).filter_province, canonical, raw);
  }
});

Deno.test('every one of the 13 canonical names maps to itself', () => {
  const names = [
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
  ];
  for (const name of names) assertEquals(args(name).filter_province, name);
});

Deno.test('an unmatched province is sent as an explicit null, never the raw text', () => {
  for (const raw of ['Atlantis', 'Somewhere Else', 'Ontario; drop table', 42, {}]) {
    const body = args(raw);
    assertEquals('filter_province' in body, true, String(raw));
    assertEquals(body.filter_province, null, String(raw));
  }
});

Deno.test('null, blank or missing province and a missing profile send an explicit null', () => {
  for (const profile of [null, {}, { province: null }, { province: '   ' }]) {
    const body = buildRetrievalArgs(VECTOR, profile);
    assertEquals(body, {
      query_embedding: VECTOR,
      match_threshold: 0.3,
      match_count: 10,
      filter_province: null,
    });
  }
});

Deno.test('persona and arrival date are not retrieval arguments', () => {
  const body = buildRetrievalArgs(VECTOR, {
    province: 'Ontario',
    persona: 'international_student',
    arrival_date: '2026-11-03',
    city: 'Toronto',
  });
  assertEquals(Object.keys(body).sort(), [
    'filter_province',
    'match_count',
    'match_threshold',
    'query_embedding',
  ]);
});
