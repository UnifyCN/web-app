// Tunables shared by the crawler handler and every adapter. Kept in one module so a
// limit can't drift between two sources that are meant to behave the same way.

/** Soonest-first cap per source, so one busy calendar can't flood the Events tab. */
export const MAX_PER_ORG = 25;

export const MAX_DESCRIPTION_CHARS = 2000;
export const MAX_TITLE_CHARS = 300;
export const FETCH_TIMEOUT_MS = 20000;

/**
 * Rolling window: only events starting between today and today + WINDOW_MONTHS are
 * ingested, so the tab neither fills with far-future placeholders nor grows without
 * bound. Enforced twice — as a server-side query bound where the source supports one,
 * and again per row in every adapter, since a source that ignores the bound (or has no
 * way to express it, like BiblioCommons) would otherwise slip rows past it.
 *
 * The web reader (services/community.ts, EVENTS_WINDOW_MONTHS) applies the same window
 * on read; keep the two in step. Nothing is ever deleted: mobile reads this shared table
 * with no date filter at all and has a Past tab, so aged-out rows must stay.
 */
export const WINDOW_MONTHS = 4;

/**
 * How much of the description the genre tiebreaker scans. Long enough for the lede that
 * actually describes the event, short enough to skip registration/contact boilerplate.
 */
export const GENRE_DESCRIPTION_SCAN_CHARS = 400;

/**
 * Sources interpret a date-bound query on their own calendar, not UTC — see
 * todayInTimezone. Every source so far is in BC, so one constant covers them all. A
 * source outside Pacific time should carry its own `timezone` on the Source record and
 * fall back to this.
 */
export const ORG_TIMEZONE = 'America/Vancouver';

/** Sent on every outbound request so source operators can identify (and contact) us. */
export const USER_AGENT = 'UnifyEventsBot/1.0 (+https://unifysocial.ca)';
