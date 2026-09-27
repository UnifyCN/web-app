import { EVENT_GENRES, type EventGenre, type EventType } from "@/types";
import { PACIFIC_TZ } from "./eventList";
import { isKnownPartnerSlug } from "./eventPartners";

/**
 * Pure logic behind the admin "Add event" form (spec #142, "Form → row mapping"):
 * form state → validated insert payload, Pacific wall time → UTC, the live
 * visibility hints, and save-error messages. Kept free of React and Supabase so it
 * is unit-tested (eventForm.test.ts). No date library (spec D9): the time-zone math
 * uses Intl only.
 */

/* ---- Pacific wall time <-> UTC ------------------------------------------ */

/** The message the form shows for a start or end time inside the spring-forward gap. */
export const DST_GAP_MESSAGE =
  "This time does not exist on this date (clocks move forward). Pick another time.";

interface WallTime {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number; // 0-23
  minute: number;
}

const WALL_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: PACIFIC_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/** The Pacific wall-clock reading at an instant (seconds dropped). */
function wallTimeAt(instantMs: number): WallTime {
  const parts: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
  for (const part of WALL_FORMAT.formatToParts(instantMs)) {
    parts[part.type] = part.value;
  }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    // Some ICU versions print midnight as "24" even with h23.
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
  };
}

/** A wall time read as if it were UTC, in ms. The basis of the offset math. */
function wallAsUtcMs(w: WallTime): number {
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute);
}

/** Pacific's offset from UTC at an instant, in ms (e.g. -7h during PDT). */
function pacificOffsetMs(instantMs: number): number {
  const minuteMs = Math.floor(instantMs / MINUTE_MS) * MINUTE_MS;
  return wallAsUtcMs(wallTimeAt(minuteMs)) - minuteMs;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})$/;

/** Parses the value of `<input type="date">` + `<input type="time">`; null if malformed. */
function parseWallTime(date: string, time: string): WallTime | null {
  const d = DATE_RE.exec(date.trim());
  const t = TIME_RE.exec(time.trim());
  if (!d || !t) return null;
  const w: WallTime = {
    year: Number(d[1]),
    month: Number(d[2]),
    day: Number(d[3]),
    hour: Number(t[1]),
    minute: Number(t[2]),
  };
  if (w.hour > 23 || w.minute > 59) return null;
  // Rejects dates like 2026-02-30, which Date.UTC would roll into March.
  const check = new Date(wallAsUtcMs(w));
  if (
    check.getUTCFullYear() !== w.year ||
    check.getUTCMonth() !== w.month - 1 ||
    check.getUTCDate() !== w.day
  ) {
    return null;
  }
  return w;
}

export type PacificToUtcResult =
  | { ok: true; iso: string }
  | { ok: false; reason: "invalid" | "gap" };

/**
 * Converts an America/Vancouver wall time ("2026-10-03", "18:00") to a UTC ISO
 * string.
 *
 * - A time in the spring-forward gap (e.g. 2026-03-08 02:30) does not exist:
 *   `{ ok: false, reason: "gap" }`.
 * - A time in the fall-back overlap (e.g. 2026-11-01 01:30) happens twice: the
 *   earlier one (PDT, UTC−7) is returned.
 *
 * Method: the zone's offset a day before and a day after the wall time covers
 * both sides of any DST change. Each offset gives a candidate instant; a candidate
 * is real when Pacific time at that instant reads back as the same wall time.
 */
export function pacificWallTimeToUtc(
  date: string,
  time: string,
): PacificToUtcResult {
  const wall = parseWallTime(date, time);
  if (!wall) return { ok: false, reason: "invalid" };

  const naive = wallAsUtcMs(wall);
  const offsets = new Set([
    pacificOffsetMs(naive - DAY_MS),
    pacificOffsetMs(naive + DAY_MS),
  ]);
  const matches = [...offsets]
    .map((offset) => naive - offset)
    .filter((instant) => wallAsUtcMs(wallTimeAt(instant)) === naive)
    .sort((a, b) => a - b);

  if (matches.length === 0) return { ok: false, reason: "gap" };
  return { ok: true, iso: new Date(matches[0]).toISOString() };
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * The inverse, for prefilling date and time inputs from a stored UTC value:
 * `{ date: "YYYY-MM-DD", time: "HH:MM" }` in Pacific time.
 */
export function utcToPacificWallTime(iso: string): {
  date: string;
  time: string;
} {
  const w = wallTimeAt(Date.parse(iso));
  return {
    date: `${w.year}-${pad2(w.month)}-${pad2(w.day)}`,
    time: `${pad2(w.hour)}:${pad2(w.minute)}`,
  };
}

/* ---- Form state --------------------------------------------------------- */

/** Formats the form offers, with their labels, in display order. */
export const EVENT_FORMAT_OPTIONS: readonly { value: EventType; label: string }[] =
  [
    { value: "in-person", label: "In person" },
    { value: "online", label: "Online" },
    { value: "hybrid", label: "Hybrid" },
  ];

/** Topics the form offers: every genre except the crawler's fallback. */
export const EVENT_TOPIC_OPTIONS: readonly EventGenre[] = EVENT_GENRES.filter(
  (genre) => genre !== "Uncategorized",
);

/** The venue name an Online event gets by default. */
export const ONLINE_VENUE = "Online";

export const TITLE_MIN = 3;
export const TITLE_MAX = 200;

/** Raw form values, as the inputs hold them. Empty string = not set. */
export interface EventFormState {
  title: string;
  description: string;
  /** `<input type="date">` value, "YYYY-MM-DD", Pacific. */
  startDate: string;
  /** `<input type="time">` value, "HH:MM", Pacific. */
  startTime: string;
  /** Optional. When blank but an end time is set, the start date is used. */
  endDate: string;
  endTime: string;
  eventType: EventType | "";
  location: string;
  /** Kept in state while Online is selected, but never saved for Online. */
  address: string;
  hostedBy: string;
  genre: EventGenre | "";
  externalLink: string;
  /** "" = no partner. */
  partnerSlug: string;
  isFeatured: boolean;
}

export const EMPTY_EVENT_FORM: EventFormState = {
  title: "",
  description: "",
  startDate: "",
  startTime: "",
  endDate: "",
  endTime: "",
  eventType: "",
  location: "",
  address: "",
  hostedBy: "",
  genre: "",
  externalLink: "",
  partnerSlug: "",
  isFeatured: false,
};

/**
 * Changes the format. Choosing Online prefills the venue with "Online" when it is
 * empty; leaving Online clears a venue that still reads "Online". A venue the
 * admin typed is never overwritten.
 */
export function withEventType(
  state: EventFormState,
  eventType: EventType,
): EventFormState {
  let location = state.location;
  if (eventType === "online" && location.trim() === "") {
    location = ONLINE_VENUE;
  } else if (eventType !== "online" && location.trim() === ONLINE_VENUE) {
    location = "";
  }
  return { ...state, eventType, location };
}

/** Street address is hidden (and not saved) for Online events. */
export function showsAddress(eventType: EventFormState["eventType"]): boolean {
  return eventType !== "online";
}

/* ---- Validation → insert payload ---------------------------------------- */

/**
 * The row the form inserts into `public.events`. `source` is always null (the
 * insert policy requires it); `max_attendees`, `id`, `created_at` and
 * `updated_at` are never sent. `cover_photo_url` arrives with the cover upload
 * (#147).
 */
export interface EventInsertPayload {
  title: string;
  description: string | null;
  event_datetime: string;
  event_end_datetime: string | null;
  event_type: EventType;
  location: string;
  address: string | null;
  hosted_by: string | null;
  genre: EventGenre;
  external_link: string;
  partner_slug: string | null;
  is_featured: boolean;
  source: null;
}

export type EventFormField =
  | "title"
  | "start"
  | "end"
  | "eventType"
  | "location"
  | "genre"
  | "externalLink"
  | "partnerSlug";

export type EventFormErrors = Partial<Record<EventFormField, string>>;

export type EventFormResult =
  | { ok: true; payload: EventInsertPayload }
  | { ok: false; errors: EventFormErrors };

const optional = (value: string): string | null => value.trim() || null;

/** True for a value that parses as an absolute `https:` or `http:` URL. */
export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return (url.protocol === "https:" || url.protocol === "http:") && !!url.host;
  } catch {
    return false;
  }
}

function startError(state: EventFormState): string | null {
  if (!state.startDate.trim()) return "Pick a start date.";
  if (!state.startTime.trim()) return "Pick a start time.";
  const result = pacificWallTimeToUtc(state.startDate, state.startTime);
  if (result.ok) return null;
  return result.reason === "gap"
    ? DST_GAP_MESSAGE
    : "Enter the start as a valid date and time.";
}

/** The start instant (UTC ISO), or null while the start is missing or invalid. */
export function startInstant(state: EventFormState): string | null {
  const result = pacificWallTimeToUtc(state.startDate, state.startTime);
  return result.ok ? result.iso : null;
}

/**
 * Validates the form. On success returns the insert payload; otherwise one
 * message per field that is wrong.
 */
export function validateEventForm(state: EventFormState): EventFormResult {
  const errors: EventFormErrors = {};

  const title = state.title.trim();
  if (!title) errors.title = "Add a title.";
  else if (title.length < TITLE_MIN || title.length > TITLE_MAX) {
    errors.title = `The title must be ${TITLE_MIN} to ${TITLE_MAX} characters.`;
  }

  const startMessage = startError(state);
  if (startMessage) errors.start = startMessage;
  const start = startInstant(state);

  let end: string | null = null;
  const hasEndDate = state.endDate.trim() !== "";
  const hasEndTime = state.endTime.trim() !== "";
  if (hasEndDate && !hasEndTime) {
    errors.end = "Add an end time, or clear the end date.";
  } else if (hasEndTime) {
    const endDate = hasEndDate ? state.endDate : state.startDate;
    const result = pacificWallTimeToUtc(endDate, state.endTime);
    if (!result.ok) {
      errors.end =
        result.reason === "gap"
          ? DST_GAP_MESSAGE
          : hasEndDate
            ? "Enter the end as a valid date and time."
            : "Pick a start date first, or add an end date.";
    } else if (start && Date.parse(result.iso) <= Date.parse(start)) {
      errors.end = "The end must be after the start.";
    } else {
      end = result.iso;
    }
  }

  const eventType = state.eventType;
  if (!EVENT_FORMAT_OPTIONS.some((option) => option.value === eventType)) {
    errors.eventType = "Pick a format.";
  }

  const location = state.location.trim();
  if (!location) errors.location = "Add a venue name.";

  const genre = state.genre;
  if (!EVENT_TOPIC_OPTIONS.includes(genre as EventGenre)) {
    errors.genre = "Pick a topic.";
  }

  const externalLink = state.externalLink.trim();
  if (!externalLink) errors.externalLink = "Add a registration or info link.";
  else if (!isHttpUrl(externalLink)) {
    errors.externalLink =
      "Enter a full link that starts with https:// or http://.";
  }

  const partnerSlug = state.partnerSlug.trim();
  if (partnerSlug && !isKnownPartnerSlug(partnerSlug)) {
    errors.partnerSlug = "Pick a partner from the list.";
  }

  if (Object.keys(errors).length > 0 || !start) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    payload: {
      title,
      description: optional(state.description),
      event_datetime: start,
      event_end_datetime: end,
      event_type: eventType as EventType,
      location,
      address: showsAddress(eventType) ? optional(state.address) : null,
      hosted_by: optional(state.hostedBy),
      genre: genre as EventGenre,
      external_link: externalLink,
      partner_slug: partnerSlug || null,
      is_featured: state.isFeatured,
      source: null,
    },
  };
}

/* ---- Visibility hints --------------------------------------------------- */

/** The apps list events that start within this many months (services/community.ts). */
export const APPS_WINDOW_MONTHS = 4;

export const NOT_ON_LANDING_HINT =
  "This event will appear in the Unify apps but not on unifysocial.ca. Turn on 'Feature' or pick a partner to show it there.";

export const SAVED_TOAST =
  "Saved. It is live in the apps now and on unifysocial.ca within about 5 minutes.";

const HINT_DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC", // the input is already a Pacific wall date
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});

/**
 * The Pacific date on which an event starting at `startIso` enters the apps'
 * 4-month window, or null when it is already inside it. The apps show an event
 * once `start < now + 4 months`, so it appears 4 calendar months before its start.
 */
export function appsAppearDate(startIso: string, now: Date): string | null {
  const startMs = Date.parse(startIso);
  const windowEnd = new Date(now);
  windowEnd.setMonth(windowEnd.getMonth() + APPS_WINDOW_MONTHS);
  if (startMs < windowEnd.getTime()) return null;

  const w = wallTimeAt(startMs);
  // Date.UTC rolls an overflowing day forward, as Date#setMonth does.
  const appears = Date.UTC(w.year, w.month - 1 - APPS_WINDOW_MONTHS, w.day);
  return HINT_DATE_FORMAT.format(appears);
}

export interface VisibilityHints {
  /** Shown when the event is neither featured nor linked to a partner. */
  notOnLanding: string | null;
  /** Shown when the start is more than 4 months ahead. */
  laterInApps: string | null;
}

/** The plain-sentence hints shown live under the form. */
export function visibilityHints(
  state: EventFormState,
  now: Date,
): VisibilityHints {
  const notOnLanding =
    !state.isFeatured && !state.partnerSlug.trim() ? NOT_ON_LANDING_HINT : null;

  const start = startInstant(state);
  const appears = start ? appsAppearDate(start, now) : null;
  const laterInApps = appears
    ? `The apps list events up to ${APPS_WINDOW_MONTHS} months ahead. This event will appear on ${appears}.`
    : null;

  return { notOnLanding, laterInApps };
}

/* ---- Save errors -------------------------------------------------------- */

export const DUPLICATE_LINK_MESSAGE = "An event with this link already exists.";
export const SAVE_FAILED_MESSAGE =
  "Could not save. Your account may not have admin access.";

/** Postgres unique_violation; on `events` the only unique column the form sets is `external_link`. */
export const UNIQUE_VIOLATION = "23505";

export type EventSaveError =
  | { kind: "duplicate"; message: string }
  | { kind: "generic"; message: string };

/** Maps a failed insert (a PostgREST error or anything else) to the message the form shows. */
export function mapSaveError(error: unknown): EventSaveError {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : null;
  if (code === UNIQUE_VIOLATION) {
    return { kind: "duplicate", message: DUPLICATE_LINK_MESSAGE };
  }
  return { kind: "generic", message: SAVE_FAILED_MESSAGE };
}
