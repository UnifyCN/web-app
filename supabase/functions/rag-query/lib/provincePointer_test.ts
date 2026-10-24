// Official immigration pointer per province or territory (spec
// UnifyCN/web-app#177, ticket #181). The seam is provinceImmigrationPointer:
// a stored province value in, the prompt block out ('' when there is none).
//
// RUN (from web-app/):
//   deno test --no-check supabase/functions/rag-query/lib/provincePointer_test.ts

import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { CANADIAN_PROVINCES } from './province.ts';
import { provinceImmigrationPointer } from './provincePointer.ts';

// Checked by hand on 2026-10-23 and 2026-10-24: each is a government-owned page
// about immigration (not a search, error or challenge page). See report-181.md.
const OFFICIAL_URL: Record<string, string> = {
  Alberta: 'https://www.alberta.ca/alberta-advantage-immigration-program',
  'British Columbia':
    'https://www.welcomebc.ca/immigrate-to-b-c/about-the-bc-provincial-nominee-program',
  Manitoba: 'https://immigratemanitoba.com/',
  'New Brunswick':
    'https://www.gnb.ca/en/topic/family-home-community/immigration/provincial-nominee-program.html',
  'Newfoundland and Labrador': 'https://www.gov.nl.ca/immigration/',
  'Northwest Territories': 'https://www.immigratenwt.ca/',
  'Nova Scotia': 'https://liveinnovascotia.com/',
  Nunavut: 'https://www.gov.nu.ca/en/immigration/immigrate-nunavut',
  Ontario: 'https://www.ontario.ca/page/ontario-immigrant-nominee-program-oinp',
  'Prince Edward Island': 'https://www.princeedwardisland.ca/en/topic/office-immigration',
  Quebec: 'https://www.quebec.ca/en/immigration',
  Saskatchewan:
    'https://www.saskatchewan.ca/residents/moving-to-saskatchewan/live-in-saskatchewan/by-immigrating/saskatchewan-immigrant-nominee-program',
  Yukon: 'https://yukon.ca/en/immigration/apply-immigrate-yukon/immigrate-yukon',
};

Deno.test('all 13 regions have a pointer with their own official URL', () => {
  assertEquals(Object.keys(OFFICIAL_URL).sort(), [...CANADIAN_PROVINCES].sort());
  for (const name of CANADIAN_PROVINCES) {
    const pointer = provinceImmigrationPointer(name);
    assertStringIncludes(pointer, OFFICIAL_URL[name], name);
    assertStringIncludes(pointer, name, name);
    const others = Object.entries(OFFICIAL_URL).filter(([n]) => n !== name);
    for (const [other, url] of others) {
      assert(!pointer.includes(url), `${name} pointer must not carry the ${other} URL`);
    }
  }
});

Deno.test('an alias reaches the same pointer as the canonical name', () => {
  assertEquals(provinceImmigrationPointer('ON'), provinceImmigrationPointer('Ontario'));
  assertEquals(provinceImmigrationPointer('  qc '), provinceImmigrationPointer('Quebec'));
});

Deno.test('no province, or an unmatched one, gives no pointer', () => {
  for (const value of [null, undefined, '', '  ', 'Atlantis', 'Somewhere Else', 7]) {
    assertEquals(provinceImmigrationPointer(value), '', String(value));
  }
});

Deno.test('Ontario, BC and Alberta point to their ingested nominee source', () => {
  for (const name of ['Ontario', 'British Columbia', 'Alberta']) {
    const pointer = provinceImmigrationPointer(name);
    assertStringIncludes(pointer, 'knowledge base');
    assert(!pointer.includes('has no'), `${name}: ${pointer}`);
  }
});

Deno.test('regions without an ingested nominee source say so and forbid memory and other provinces', () => {
  for (const name of [
    'Manitoba',
    'New Brunswick',
    'Newfoundland and Labrador',
    'Northwest Territories',
    'Nova Scotia',
    'Prince Edward Island',
    'Saskatchewan',
    'Yukon',
  ]) {
    const pointer = provinceImmigrationPointer(name);
    assertStringIncludes(pointer, `no ${name} nominee program source`, name);
    assertStringIncludes(pointer, 'from memory', name);
    assertStringIncludes(pointer, "another province's", name);
  }
});

Deno.test('Quebec is not described as a nominee program', () => {
  const pointer = provinceImmigrationPointer('Quebec');
  assertStringIncludes(pointer, 'not part of the provincial nominee program');
  assertStringIncludes(pointer, 'do not describe');
  assert(!pointer.includes('nominee program source'), pointer);
});

Deno.test('Nunavut has no nominee program and is not given an invented one', () => {
  const pointer = provinceImmigrationPointer('Nunavut');
  assertStringIncludes(pointer, 'no separate immigration pathway');
  assertStringIncludes(pointer, 'no nominee program');
  assertStringIncludes(pointer, 'federal');
  assert(!pointer.includes('nominee program source'), pointer);
});
