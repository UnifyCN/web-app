// Profile (plus the clock) to the USER PROFILE CONTEXT block of the model
// prompt (spec UnifyCN/web-app#177, ticket #181). The seam is
// buildUserProfileContext. Dates are compared as UTC calendar dates.
//
// RUN (from web-app/):
//   deno test --no-check supabase/functions/rag-query/lib/profile_test.ts
//   TZ=Pacific/Kiritimati deno test --no-check supabase/functions/rag-query/lib/profile_test.ts

import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { buildUserProfileContext } from './profile.ts';

const NOW = new Date('2026-10-23T12:00:00Z');

function context(profile: Record<string, unknown>, now: Date = NOW): string {
  return buildUserProfileContext(profile, now);
}

const worker = {
  persona: 'skilled_worker',
  city: 'Toronto',
  province: 'Ontario',
};

function assertNoArrival(text: string) {
  assert(!text.includes('arrived'), text);
  assert(!text.includes('plans to arrive'), text);
}

Deno.test('a future arrival says plans to arrive, with a Month D, YYYY date', () => {
  const text = context({ ...worker, arrival_date: '2026-11-03' });
  assertStringIncludes(
    text,
    'You are speaking with a skilled worker who plans to arrive in Toronto on November 3, 2026.'
  );
  assertStringIncludes(text, 'Their destination province is Ontario.');
  assert(!text.includes('arrived'), text);
});

Deno.test('a future arrival without a city says in Canada', () => {
  const text = context({
    persona: 'refugee',
    city: null,
    province: null,
    arrival_date: '2027-01-09',
  });
  assertStringIncludes(
    text,
    'You are speaking with a refugee who plans to arrive in Canada on January 9, 2027.'
  );
  assert(!text.includes('destination province'), text);
});

Deno.test('a past arrival says arrived (province kept, date as Month D, YYYY)', () => {
  const text = context({ ...worker, arrival_date: '2024-01-15' });
  assertStringIncludes(
    text,
    'You are speaking with a skilled worker who arrived in Toronto, Ontario on January 15, 2024.'
  );
  assert(!text.includes('plans to arrive'), text);
});

Deno.test('a past arrival with province only, and with persona only', () => {
  assertStringIncludes(
    context({ persona: 'international_student', province: 'Alberta', arrival_date: '2025-09-01' }),
    'You are speaking with a international student in Alberta, who arrived on September 1, 2025.'
  );
  assertStringIncludes(
    context({ persona: 'other', arrival_date: '2025-09-01' }),
    'You are speaking with a other in Canada, who arrived on September 1, 2025.'
  );
});

Deno.test('an alias province is shown by its canonical name', () => {
  const text = context({ ...worker, province: 'ON', arrival_date: '2024-01-15' });
  assertStringIncludes(text, 'arrived in Toronto, Ontario on January 15, 2024');
});

Deno.test('UTC boundary: arrival on the UTC day of now has arrived; the next UTC day is planned', () => {
  const late = new Date('2026-10-23T23:59:59Z');
  assertStringIncludes(context({ ...worker, arrival_date: '2026-10-23' }, late), 'arrived in Toronto');
  assertStringIncludes(
    context({ ...worker, arrival_date: '2026-10-24' }, late),
    'plans to arrive in Toronto on October 24, 2026'
  );
  const midnight = new Date('2026-10-24T00:00:00Z');
  assertStringIncludes(context({ ...worker, arrival_date: '2026-10-24' }, midnight), 'arrived in Toronto');
  const early = new Date('2026-10-23T00:00:00Z');
  assertStringIncludes(
    context({ ...worker, arrival_date: '2026-10-24' }, early),
    'plans to arrive in Toronto on October 24, 2026'
  );
});

Deno.test('UTC boundary: a timestamp is read as its UTC date, whatever its offset or the machine time zone', () => {
  const now = new Date('2026-10-24T01:00:00Z');
  // 23:30 at UTC-5 on Oct 23 is Oct 24 04:30 UTC: that UTC day is today.
  assertStringIncludes(
    context({ ...worker, arrival_date: '2026-10-23T23:30:00-05:00' }, now),
    'arrived in Toronto, Ontario on October 24, 2026'
  );
  // 00:30 at UTC+2 on Oct 25 is Oct 24 22:30 UTC: today in UTC, not tomorrow.
  assertStringIncludes(
    context({ ...worker, arrival_date: '2026-10-25T00:30:00+02:00' }, now),
    'arrived in Toronto, Ontario on October 24, 2026'
  );
  // 23:30 at UTC-5 on Oct 24 is Oct 25 04:30 UTC: tomorrow in UTC.
  assertStringIncludes(
    context({ ...worker, arrival_date: '2026-10-24T23:30:00-05:00' }, now),
    'plans to arrive in Toronto on October 25, 2026'
  );
  // No offset means UTC; a Z timestamp is the same day.
  assertStringIncludes(
    context({ ...worker, arrival_date: '2026-10-25T00:00:00' }, now),
    'plans to arrive in Toronto on October 25, 2026'
  );
  assertStringIncludes(
    context({ ...worker, arrival_date: '2026-10-24T00:00:00.000Z' }, now),
    'arrived in Toronto, Ontario on October 24, 2026'
  );
});

Deno.test('the date rolls over a year and a leap day', () => {
  assertStringIncludes(
    context({ ...worker, arrival_date: '2028-02-29' }),
    'plans to arrive in Toronto on February 29, 2028'
  );
  const newYear = new Date('2026-12-31T23:59:59Z');
  assertStringIncludes(
    context({ ...worker, arrival_date: '2027-01-01' }, newYear),
    'plans to arrive in Toronto on January 1, 2027'
  );
});

Deno.test('a null, blank or invalid arrival date omits the whole arrival sentence', () => {
  const invalid: unknown[] = [
    null,
    undefined,
    '',
    '   ',
    'soon',
    '2026-02-30',
    '2026-13-01',
    '2026-00-10',
    '2026-04-31',
    '2027-02-29',
    '0000-00-00',
    '2026-11-3',
    '11/03/2026',
    '2026-11-03T25:00:00Z',
    '2026-11-03T10:61:00Z',
    '2026-11-03junk',
    20261103,
    {},
  ];
  for (const arrival_date of invalid) {
    const text = context({ ...worker, goals: ['find_housing'], arrival_date });
    assertNoArrival(text);
    // The persona and location, and the rest of the profile, are kept.
    assertStringIncludes(text, 'You are speaking with a skilled worker in Toronto, Ontario.');
    assertStringIncludes(text, 'Their goals: find housing.');
  }
});

Deno.test('the rest of the profile is preserved with a future arrival', () => {
  const text = context({
    ...worker,
    goals: ['find_housing', 'get_pr'],
    learning_interests: ['banking_basics'],
    arrival_date: '2026-11-03',
  });
  assertStringIncludes(text, '\nUSER PROFILE CONTEXT:\n');
  assertStringIncludes(text, 'Their goals: find housing, get pr.');
  assertStringIncludes(text, 'Their interests: banking basics.');
  assertStringIncludes(text, 'Tailor your responses to their specific situation, location, and goals.');
  assertStringIncludes(text, 'Refer to local resources in Toronto when relevant.');
  assertStringIncludes(text, 'Do NOT assume cultural traits');
});

Deno.test('an empty profile gives no block; goals alone still give one', () => {
  assertEquals(context({}), '');
  assertEquals(context({ arrival_date: 'soon', province: 'Atlantis' }), '');
  const text = context({ goals: ['get_pr'] });
  assertStringIncludes(text, 'Their goals: get pr.');
  assertNoArrival(text);
});

const NO_PERSONA = [null, undefined, '', '   ', 42];

Deno.test('without a persona, a valid future arrival is kept and no persona is invented', () => {
  for (const persona of NO_PERSONA) {
    const text = context({
      persona,
      city: 'Toronto',
      province: 'Ontario',
      arrival_date: '2026-12-01',
      goals: ['get_pr'],
    });
    assertStringIncludes(
      text,
      'You are speaking with a user who plans to arrive in Toronto on December 1, 2026. Their destination province is Ontario.'
    );
    assertStringIncludes(text, 'Their goals: get pr.');
    assertStringIncludes(text, 'Refer to local resources in Toronto when relevant.');
    assert(!text.includes('skilled'), text);
    assert(!text.includes('arrived'), text);
  }
});

Deno.test('without a persona, a current or past arrival says arrived, with and without a city', () => {
  for (const persona of NO_PERSONA) {
    assertStringIncludes(
      context({ persona, city: 'Toronto', province: 'ON', arrival_date: '2026-10-23' }),
      'You are speaking with a user who arrived in Toronto, Ontario on October 23, 2026.'
    );
    assertStringIncludes(
      context({ persona, city: 'Toronto', province: 'Ontario', arrival_date: '2024-01-15' }),
      'You are speaking with a user who arrived in Toronto, Ontario on January 15, 2024.'
    );
    assertStringIncludes(
      context({ persona, province: 'Alberta', arrival_date: '2024-01-15' }),
      'You are speaking with a user in Alberta, who arrived on January 15, 2024.'
    );
    assertStringIncludes(
      context({ persona, arrival_date: '2024-01-15' }),
      'You are speaking with a user in Canada, who arrived on January 15, 2024.'
    );
  }
});

Deno.test('without a persona or a city, a future arrival says Canada', () => {
  const text = context({ province: 'Ontario', arrival_date: '2027-01-09' });
  assertStringIncludes(
    text,
    'You are speaking with a user who plans to arrive in Canada on January 9, 2027. Their destination province is Ontario.'
  );
  assert(!text.includes('local resources'), text);
  assertStringIncludes(
    context({ arrival_date: '2027-01-09' }),
    'You are speaking with a user who plans to arrive in Canada on January 9, 2027.'
  );
});

Deno.test('without a persona, location alone is kept; invalid or missing dates stay omitted', () => {
  assertStringIncludes(
    context({ city: 'Toronto', province: 'Ontario' }),
    'You are speaking with a user in Toronto, Ontario.'
  );
  assertStringIncludes(context({ city: 'Toronto' }), 'You are speaking with a user in Toronto.');
  for (const arrival_date of [null, undefined, '', 'soon', '2026-02-30', '2026-11-03T25:00:00Z', 20261103]) {
    const text = context({ city: 'Toronto', province: 'Ontario', goals: ['get_pr'], arrival_date });
    assertNoArrival(text);
    assertStringIncludes(text, 'You are speaking with a user in Toronto, Ontario.');
    assertStringIncludes(text, 'Their goals: get pr.');
  }
  assertEquals(context({ persona: null, arrival_date: 'soon' }), '');
});

Deno.test('a city without a province keeps the city with a persona too', () => {
  assertStringIncludes(
    context({ persona: 'refugee', city: 'Halifax' }),
    'You are speaking with a refugee in Halifax.'
  );
});

Deno.test('a province that is not one of the 13 names behaves exactly like a null province', () => {
  const unknown = ['Atlantis', 'constructor', '__proto__', 'toString', 'Ontario; drop table', '', '   ', 42, {}];
  for (const province of unknown) {
    for (const arrival_date of [null, '2026-12-01', '2024-01-15']) {
      for (const persona of ['skilled_worker', null]) {
        const withUnknown = context({ persona, city: 'Toronto', province, arrival_date, goals: ['get_pr'] });
        const withNull = context({ persona, city: 'Toronto', province: null, arrival_date, goals: ['get_pr'] });
        assertEquals(withUnknown, withNull, JSON.stringify({ province, arrival_date, persona }));
        for (const word of ['Atlantis', 'constructor', '__proto__', 'toString', 'drop table', 'destination province']) {
          assert(!withUnknown.includes(word), `${word} in: ${withUnknown}`);
        }
        // city, persona, goals and date facts stay
        assertStringIncludes(withUnknown, 'Toronto');
        assertStringIncludes(withUnknown, 'Their goals: get pr.');
      }
    }
  }
  // a province alone with an unknown name and nothing else is an empty profile
  assertEquals(context({ province: 'Atlantis' }), '');
  assertStringIncludes(
    context({ persona: 'skilled_worker', province: 'Atlantis' }),
    'You are speaking with a skilled worker in Canada.'
  );
});
