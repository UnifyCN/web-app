"use client";

import { useTranslation } from "react-i18next";
import { EVENT_GENRES, type CommunityEvent, type EventGenre } from "@/types";
import { cn } from "@/lib/utils";

interface EventGenreFilterProps {
  /** The full (unfiltered) event list — chip visibility and counts derive from it. */
  events: CommunityEvent[];
  /** null = "All". */
  value: EventGenre | null;
  onChange: (genre: EventGenre | null) => void;
}

/**
 * Topic chips above the Events grid. Only genres actually present in `events` get a
 * chip, so the row never offers a filter that resolves to nothing — which also means
 * it collapses to just "All" until the crawler has tagged some rows.
 */
export function EventGenreFilter({
  events,
  value,
  onChange,
}: EventGenreFilterProps) {
  const { t } = useTranslation();

  const counts = new Map<EventGenre, number>();
  for (const event of events) {
    counts.set(event.genre, (counts.get(event.genre) ?? 0) + 1);
  }
  // EVENT_GENRES order, not insertion order, so the chips don't reshuffle as the
  // underlying events change.
  const present = EVENT_GENRES.filter((genre) => counts.has(genre));

  // A single topic isn't a choice — "All" and that one chip select the same set.
  if (present.length < 2) return null;

  const chipClass = (selected: boolean) =>
    cn(
      "shrink-0 cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition-colors",
      selected
        ? "bg-primary text-white"
        : "bg-surface-gray text-ink-muted hover:text-ink",
    );

  return (
    <div
      role="group"
      aria-label={t("events.filterByCategory")}
      className="scrollbar-thin mb-4 flex gap-2 overflow-x-auto pb-1"
    >
      <button
        type="button"
        onClick={() => onChange(null)}
        aria-pressed={value === null}
        className={chipClass(value === null)}
      >
        {t("events.all")}
      </button>
      {present.map((genre) => (
        <button
          key={genre}
          type="button"
          onClick={() => onChange(genre)}
          aria-pressed={value === genre}
          className={chipClass(value === genre)}
        >
          {t(`events.genre.${genre.toLowerCase()}`)}
          <span className="ms-1 opacity-70">{counts.get(genre)}</span>
        </button>
      ))}
    </div>
  );
}
