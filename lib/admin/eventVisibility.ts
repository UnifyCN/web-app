import {
  buildCrawlerEventUpdate,
  type CrawlerEventUpdatePayload,
} from "./eventForm";
import type { AdminEvent } from "./eventList";

/**
 * Pure logic behind the inline "Feature" switch and partner dropdown on each
 * /admin/events row (#146): which payload a change sends, and how the cached list
 * changes optimistically and rolls back. Free of React and Supabase so it is
 * unit-tested (eventVisibility.test.ts).
 *
 * Every row, team or crawler, saves the same payload: exactly `is_featured`,
 * `partner_slug` and `updated_at` (buildCrawlerEventUpdate). All three columns are in
 * the per-column UPDATE grant, so the payload is valid on both kinds of row.
 */

/** The two row fields an inline control changes. */
export interface EventVisibility {
  isFeatured: boolean;
  /** Null = no partner. */
  partnerSlug: string | null;
}

/** One inline change: the switch sends `isFeatured`, the dropdown `partnerSlug` ("" = None). */
export type VisibilityChange = { isFeatured: boolean } | { partnerSlug: string };

export type VisibilityEdit =
  /** Save `payload`; show `next` at once and go back to `previous` if the save fails. */
  | {
      kind: "save";
      id: number;
      previous: EventVisibility;
      next: EventVisibility;
      payload: CrawlerEventUpdatePayload;
    }
  /** Nothing changes, so nothing is sent. */
  | { kind: "unchanged" }
  /** The change cannot be saved; `message` shows inline on the row. */
  | { kind: "invalid"; message: string };

export function visibilityOf(
  event: Pick<AdminEvent, "isFeatured" | "partnerSlug">,
): EventVisibility {
  return { isFeatured: event.isFeatured, partnerSlug: event.partnerSlug };
}

function sameVisibility(a: EventVisibility, b: EventVisibility): boolean {
  return a.isFeatured === b.isFeatured && a.partnerSlug === b.partnerSlug;
}

/**
 * What one inline change does to `event`. The payload carries both fields: the one
 * the admin changed and the row's current value of the other.
 *
 * A row whose stored `partner_slug` is not in the list (set by hand in the Table
 * Editor) cannot be featured until the admin picks a listed partner or None: the
 * builder rejects the unknown slug, as the edit page does (#145).
 */
export function planVisibilityEdit(
  event: Pick<AdminEvent, "id" | "isFeatured" | "partnerSlug">,
  change: VisibilityChange,
  now: Date,
): VisibilityEdit {
  const previous = visibilityOf(event);
  const result = buildCrawlerEventUpdate(
    {
      isFeatured: "isFeatured" in change ? change.isFeatured : previous.isFeatured,
      partnerSlug:
        "partnerSlug" in change ? change.partnerSlug : (previous.partnerSlug ?? ""),
    },
    now,
  );
  if (!result.ok) {
    return { kind: "invalid", message: result.errors.partnerSlug ?? "" };
  }

  const next: EventVisibility = {
    isFeatured: result.payload.is_featured,
    partnerSlug: result.payload.partner_slug,
  };
  // Compare with the trimmed stored slug, so " rbc" -> "rbc" is not a change.
  const current: EventVisibility = {
    isFeatured: previous.isFeatured,
    partnerSlug: previous.partnerSlug?.trim() || null,
  };
  if (sameVisibility(current, next)) return { kind: "unchanged" };

  return { kind: "save", id: event.id, previous, next, payload: result.payload };
}

/**
 * The optimistic step: the list with row `id` showing `visibility`. Every other row
 * keeps its object, and a list without that row (or no list yet) comes back as is
 * (the same array, so React Query sees no change).
 */
export function withEventVisibility<T extends AdminEvent>(
  events: readonly T[] | undefined,
  id: number,
  visibility: EventVisibility,
): T[] | undefined {
  if (!events) return undefined;
  if (!events.some((event) => event.id === id)) return events as T[];
  return events.map((event) =>
    event.id === id
      ? { ...event, isFeatured: visibility.isFeatured, partnerSlug: visibility.partnerSlug }
      : event,
  );
}

/**
 * The rollback after a failed save: row `id` goes back to `previous`, but only while
 * it still shows the value that failed (`attempted`). If a refetch has already put
 * the stored value there, that value stays.
 */
export function rollbackEventVisibility<T extends AdminEvent>(
  events: readonly T[] | undefined,
  id: number,
  previous: EventVisibility,
  attempted: EventVisibility,
): T[] | undefined {
  if (!events) return undefined;
  const row = events.find((event) => event.id === id);
  if (!row || !sameVisibility(visibilityOf(row), attempted)) return events as T[];
  return withEventVisibility(events, id, previous);
}
