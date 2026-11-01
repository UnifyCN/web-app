// Unit checks for placeNames.ts: words that must NOT be read as a place or an
// arrival time. Written after placeNames.ts (not test-first); the binding
// behaviour is in index_companion_context_test.ts.
import { assertEquals } from 'jsr:@std/assert@1';
import { arrivalIn, placeIn } from './placeNames.ts';

Deno.test('placeIn: common words and lower-case Latin names are not places', () => {
  for (const text of [
    'Victory is near',
    'my friend regina said hi',
    'التواصل مع البنك', // contains letters of a city prefix pattern, not a city
    'मैं सरेंडर नहीं करूँगा',
    'Tôi muốn mở tài khoản ngân hàng',
  ]) {
    assertEquals(placeIn(text), { city: null, province: null, unclear: null }, text);
  }
});

Deno.test('placeIn: Arabic prefixes and folded spellings still match', () => {
  assertEquals(placeIn('سأنتقل لتورونتو').city, 'Toronto');
  assertEquals(placeIn('وفي فانكوفر').city, 'Vancouver');
  assertEquals(placeIn('ਟੋਰੰਟੋ').city, 'Toronto');
  assertEquals(placeIn('टोरोंटो').city, 'Toronto');
});

Deno.test('arrivalIn: no time without an arrival cue, and ambiguous words are not times', () => {
  assertEquals(arrivalIn('What is a TFSA next week?'), null);
  assertEquals(arrivalIn('Llego a Toronto por la mañana'), null);
  assertEquals(arrivalIn('मैं कल टोरंटो पहुँच रहा हूँ'), null); // "kal": yesterday or tomorrow
  assertEquals(arrivalIn('Llego a Toronto mañana')?.phrase, 'tomorrow');
  assertEquals(arrivalIn('J’arrive dans 2 semaines')?.phrase, 'in_weeks:2');
});
