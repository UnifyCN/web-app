// UTC calendar-date parsing (spec UnifyCN/web-app#177, ticket #181). The seam
// is parseUtcDate: a stored date or timestamp in, the UTC calendar date out.
//
// RUN (from web-app/):
//   deno test --no-check supabase/functions/rag-query/lib/dates_test.ts

import { assertEquals } from 'jsr:@std/assert@1';
import { formatIsoDate, parseUtcDate } from './dates.ts';

function utc(value: string): string | null {
  const date = parseUtcDate(value);
  return date ? formatIsoDate(date) : null;
}

Deno.test('an offset moves the date in the input year, not in a leap year', () => {
  // March 1, 00:30 at +01:00 is February 28 (or 29 in a leap year) in UTC.
  assertEquals(utc('2026-03-01T00:30:00+01:00'), '2026-02-28');
  assertEquals(utc('2025-03-01T00:30:00+01:00'), '2025-02-28');
  assertEquals(utc('2027-03-01T00:30:00+01:00'), '2027-02-28');
  assertEquals(utc('2024-03-01T00:30:00+01:00'), '2024-02-29');
  assertEquals(utc('2028-03-01T00:30:00+01:00'), '2028-02-29');
  assertEquals(utc('2000-03-01T00:30:00+01:00'), '2000-02-29');
  assertEquals(utc('1900-03-01T00:30:00+01:00'), '1900-02-28');
});

Deno.test('offsets cross month and year ends in both directions', () => {
  assertEquals(utc('2026-01-01T00:30:00+01:00'), '2025-12-31');
  assertEquals(utc('2025-12-31T23:30:00-01:00'), '2026-01-01');
  assertEquals(utc('2026-05-01T02:00:00+05:30'), '2026-04-30');
  assertEquals(utc('2026-02-28T23:30:00-02:00'), '2026-03-01');
  assertEquals(utc('2028-02-28T23:30:00-02:00'), '2028-02-29');
  assertEquals(utc('2026-10-20T23:30:00-05:00'), '2026-10-21');
  assertEquals(utc('2026-10-21T10:00:00Z'), '2026-10-21');
  assertEquals(utc('2026-10-21'), '2026-10-21');
});

Deno.test('years 0 to 99 keep their own year and calendar', () => {
  assertEquals(utc('0050-06-15'), '0050-06-15');
  assertEquals(utc('0004-03-01T00:30:00+01:00'), '0004-02-29');
  assertEquals(utc('0005-03-01T00:30:00+01:00'), '0005-02-28');
  assertEquals(utc('0099-01-01T00:30:00+01:00'), '0098-12-31');
});

Deno.test('every valid timestamp matches the engine UTC date, and invalid calendars stay null', () => {
  const offsets = ['-14:00', '-08:00', '-01:00', '+00:00', '+01:00', '+08:00', '+14:00'];
  let checked = 0;
  for (let year = 2023; year <= 2029; year++) {
    for (let day = 0; day < 366; day++) {
      const base = new Date(Date.UTC(year, 0, 1 + day));
      if (base.getUTCFullYear() !== year) continue;
      const ymd = base.toISOString().slice(0, 10);
      for (const time of ['00:30:00', '23:30:00']) {
        for (const offset of offsets) {
          const input = `${ymd}T${time}${offset}`;
          assertEquals(utc(input), new Date(input).toISOString().slice(0, 10), input);
          checked++;
        }
      }
    }
  }
  assertEquals(checked > 25000, true);
  for (const bad of ['2026-02-29', '2025-02-29', '2026-04-31', '2026-13-01', '2026-00-10', '2026-03-01T24:00:00Z', '2026-03-01T00:30:00+24:00']) {
    assertEquals(parseUtcDate(bad), null, bad);
  }
  assertEquals(utc('2028-02-29'), '2028-02-29');
});
