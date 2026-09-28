import type { EventType } from "@/types";

/**
 * Pure logic behind the /admin/events list: which rows show, in what order, in which
 * tab, and how their date, time, and format read. Kept free of React and Supabase so
 * it is unit-tested (eventList.test.ts).
 */

/** Events are BC-based; the admin UI shows every date and time in Pacific time. */
export const PACIFIC_TZ = "America/Vancouver";

/** One `public.events` row as the admin list needs it (camelCase). */
export interface AdminEvent {
  id: number;
  title: string;
  /** Start, an exact UTC instant (ISO string). */
  eventDatetime: string;
  /** End, or null when the event has no end time. */
  eventEndDatetime: string | null;
  /** `in-person` | `online` | `hybrid` on well-formed rows; free text on the table. */
  eventType: string;
  location: string;
  partnerSlug: string | null;
  isFeatured: boolean;
  /** Null for rows the team added; `crawler:<org>` for rows the events-crawler added. */
  source: string | null;
}

/** The two list tabs. "team" is selected by default. */
export type AdminEventTab = "team" | "partners";

export const ADMIN_EVENT_TABS: readonly { id: AdminEventTab; label: string }[] = [
  { id: "team", label: "Added by team" },
  { id: "partners", label: "From partners" },
];

/**
 * A row the team added by hand. The spec (D4) defines manual rows as `source is null`,
 * and the delete policy uses the same test, so this must stay in step with it. Every
 * other row (in practice `crawler:*`) goes to the partners tab.
 */
export function isTeamEvent(event: Pick<AdminEvent, "source">): boolean {
  return event.source == null;
}

/**
 * True while the event has not ended: its end, or its start when it has no end, is at
 * or after `now`. An event that is in progress still shows, so the team can still
 * feature or fix it.
 */
export function hasNotEnded(
  event: Pick<AdminEvent, "eventDatetime" | "eventEndDatetime">,
  now: Date,
): boolean {
  const endsAt = Date.parse(event.eventEndDatetime ?? event.eventDatetime);
  return Number.isFinite(endsAt) && endsAt >= now.getTime();
}

/**
 * The PostgREST `or=` filter for "not ended" (same rule as hasNotEnded), so the
 * database returns only the rows the list shows. The timestamp is double-quoted
 * because it contains `.` and `:`.
 */
export function notEndedFilter(now: Date): string {
  const at = `"${now.toISOString()}"`;
  return `event_end_datetime.gte.${at},and(event_end_datetime.is.null,event_datetime.gte.${at})`;
}

/** Rows that have not ended, soonest start first (ties by id, so the order is stable). */
export function upcomingSoonestFirst<T extends AdminEvent>(
  events: readonly T[],
  now: Date,
): T[] {
  return events
    .filter((event) => hasNotEnded(event, now))
    .sort(
      (a, b) =>
        Date.parse(a.eventDatetime) - Date.parse(b.eventDatetime) || a.id - b.id,
    );
}

/** Splits rows into the two tabs, keeping their order. */
export function splitByTab<T extends AdminEvent>(
  events: readonly T[],
): Record<AdminEventTab, T[]> {
  const team: T[] = [];
  const partners: T[] = [];
  for (const event of events) {
    (isTeamEvent(event) ? team : partners).push(event);
  }
  return { team, partners };
}

const FORMAT_LABELS: Record<EventType, string> = {
  "in-person": "In person",
  online: "Online",
  hybrid: "Hybrid",
};

/** "In person" / "Online" / "Hybrid"; an unknown value shows as stored. */
export function formatLabel(eventType: string): string {
  return FORMAT_LABELS[eventType as EventType] ?? eventType;
}

interface PacificParts {
  weekday: string;
  month: string;
  day: string;
  year: string;
  time: string;
}

const PARTS_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: PACIFIC_TZ,
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

function pacificParts(instant: Date): PacificParts {
  const parts: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
  for (const part of PARTS_FORMAT.formatToParts(instant)) {
    parts[part.type] = part.value;
  }
  return {
    weekday: parts.weekday ?? "",
    month: parts.month ?? "",
    day: parts.day ?? "",
    year: parts.year ?? "",
    // Built by hand so the space before AM/PM is a plain space on every ICU version.
    time: `${parts.hour}:${parts.minute} ${parts.dayPeriod}`,
  };
}

function dateLabel(p: PacificParts, nowYear: string): string {
  const base = `${p.weekday}, ${p.month} ${p.day}`;
  return p.year === nowYear ? base : `${base}, ${p.year}`;
}

export interface PacificWhen {
  /** "Sat, Oct 4" — the year is added when it is not the current Pacific year. */
  date: string;
  /** "6:00 PM", or "6:00 PM – 8:00 PM" when the event ends the same Pacific day. */
  time: string;
  /** "Mon, Oct 6" when the event ends on a later Pacific day; otherwise null. */
  endsOn: string | null;
}

/** The date and time of an event in Pacific time, for the admin list. */
export function formatPacificWhen(
  startIso: string,
  endIso: string | null,
  now: Date,
): PacificWhen {
  const nowYear = pacificParts(now).year;
  const start = pacificParts(new Date(startIso));
  const date = dateLabel(start, nowYear);
  if (!endIso) return { date, time: start.time, endsOn: null };

  const end = pacificParts(new Date(endIso));
  const endDate = dateLabel(end, nowYear);
  if (endDate === date) {
    return { date, time: `${start.time} – ${end.time}`, endsOn: null };
  }
  return { date, time: start.time, endsOn: endDate };
}
