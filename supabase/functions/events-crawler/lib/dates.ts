// Date helpers. Everything stored in public.events is UTC ISO; everything used to bound
// a source query is a calendar date in the source's own timezone.

/** "YYYY-MM-DD HH:MM:SS" or ISO-ish (UTC) → ISO Z. Returns null on anything unparseable. */
export function toIsoUtc(value: string | null | undefined): string | null {
  if (!value || typeof value !== 'string') return null;
  const m = value.trim().match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/);
  if (!m) return null;
  const iso = `${m[1]}T${m[2]}Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * An ISO-8601 timestamp that already carries its own offset ("2026-08-20T18:15:00Z",
 * "2026-07-30T09:00:00-07:00") → ISO Z. Distinct from toIsoUtc, which assumes UTC for
 * offset-less input; feeding an offset-bearing string to that one would silently shift
 * the time by the offset.
 */
export function offsetIsoToUtc(value: string | null | undefined): string | null {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed)) return null;
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Today's date as YYYY-MM-DD on `timeZone`'s calendar, NOT UTC's.
 *
 * Sources interpret a date bound on their own calendar, so using the UTC date would
 * silently drop events happening later the same local day for any run between 00:00Z and
 * 08:00Z — the window where UTC has already rolled over to tomorrow but Vancouver has
 * not. The scheduled Monday 14:00 UTC run is outside that window, but a manual or
 * rescheduled run lands in it easily. 'en-CA' already formats as YYYY-MM-DD.
 */
export function todayInTimezone(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * The far edge of the rolling window as YYYY-MM-DD, `months` after today on `timeZone`'s
 * calendar — the counterpart to todayInTimezone.
 *
 * Date.UTC normalises overflow, so a short target month rolls forward rather than
 * throwing (Oct 31 + 4 months → Feb 31 → Mar 3). A couple of days of slack on the far
 * edge of a four-month bound doesn't matter; being off by a whole month would.
 */
export function windowEndInTimezone(
  timeZone: string,
  months: number,
  now: Date = new Date(),
): string {
  const [year, month, day] = todayInTimezone(timeZone, now).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1 + months, day)).toISOString().slice(0, 10);
}
