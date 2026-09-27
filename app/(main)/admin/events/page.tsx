"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2, CalendarDays, Plus, Star } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import { useAdminEvents } from "@/hooks/useAdminEvents";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import {
  ADMIN_EVENT_TABS,
  formatLabel,
  formatPacificWhen,
  splitByTab,
  type AdminEvent,
  type AdminEventTab,
} from "@/lib/admin/eventList";
import { partnerLabel } from "@/lib/admin/eventPartners";
import { cn } from "@/lib/utils";

/*
 * /admin/events — the read-only list of every event that has not ended (spec #142,
 * slice #143). The admin layout already 404s non-admins. English only (spec D8).
 * Inline feature/partner controls, Edit, and Delete arrive in later slices.
 */

const EMPTY_COPY: Record<AdminEventTab, { title: string; body: string }> = {
  team: {
    title: "No upcoming events from the team",
    body: "Events the team adds show here, soonest first.",
  },
  partners: {
    title: "No upcoming events from partners",
    body: "The events crawler adds partner events every Monday.",
  },
};

function EventRow({ event, now }: { event: AdminEvent; now: Date }) {
  const when = formatPacificWhen(event.eventDatetime, event.eventEndDatetime, now);
  const partner = partnerLabel(event.partnerSlug);

  return (
    <li className="flex gap-4 px-4 py-3.5 sm:px-5">
      <div className="w-24 shrink-0 sm:w-32">
        <p className="text-sm font-semibold text-ink-secondary">{when.date}</p>
        <p className="mt-0.5 text-xs text-ink-muted">{when.time}</p>
        {when.endsOn && (
          <p className="mt-0.5 text-xs text-ink-placeholder">
            Until {when.endsOn}
          </p>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium break-words text-ink-secondary">
          {event.title}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-ink-muted">
          {event.isFeatured && (
            <Badge leftIcon={<Star className="h-3 w-3 fill-current" aria-hidden />}>
              Featured
            </Badge>
          )}
          <span>{formatLabel(event.eventType)}</span>
          <span className="inline-flex min-w-0 items-center gap-1">
            <Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {partner ? (
              <span className="truncate">{partner}</span>
            ) : (
              <span className="text-ink-placeholder">No partner</span>
            )}
          </span>
        </div>
      </div>
    </li>
  );
}

function ListSkeleton() {
  return (
    <ul
      className="divide-y divide-border-card rounded-card border border-border-card bg-surface"
      aria-hidden
    >
      {Array.from({ length: 4 }).map((_, i) => (
        <li key={i} className="flex animate-pulse gap-4 px-4 py-3.5 sm:px-5">
          <div className="w-24 shrink-0 space-y-2 sm:w-32">
            <div className="h-3.5 w-20 rounded bg-surface-gray" />
            <div className="h-3 w-14 rounded bg-surface-gray" />
          </div>
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-3/4 rounded bg-surface-gray" />
            <div className="h-3 w-1/3 rounded bg-surface-gray" />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function AdminEventsPage() {
  const { data: events, isLoading, isError, refetch, isFetching } =
    useAdminEvents();
  const [activeTab, setActiveTab] = useState<AdminEventTab>("team");
  // One clock per mount: the year shown next to a date depends on it, and reading
  // the clock during render would make renders impure.
  const [now] = useState(() => new Date());

  const byTab = splitByTab(events ?? []);
  const labels = ADMIN_EVENT_TABS.map(({ id, label }) =>
    events ? `${label} (${byTab[id].length})` : label,
  );
  const activeIndex = ADMIN_EVENT_TABS.findIndex(({ id }) => id === activeTab);
  const rows = byTab[activeTab];

  return (
    <div className="mx-auto max-w-[800px] animate-fade-in px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-ink-secondary">
            Events admin
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Every event that has not ended, soonest first. Times are Pacific.
          </p>
        </div>
        <Link
          href="/admin/events/new"
          className={cn(
            "inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg px-4",
            "bg-primary text-sm font-semibold text-white transition-colors duration-200 hover:bg-primary-dark",
            "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none",
          )}
        >
          <Plus className="h-4 w-4" aria-hidden />
          Add event
        </Link>
      </header>

      {!isSupabaseConfigured() && (
        <p className="mt-4 rounded-lg border border-border-card bg-surface-card px-4 py-3 text-xs text-ink-muted">
          Supabase is not configured in this environment, so no events load.
        </p>
      )}

      <Tabs
        className="mt-5"
        tabs={labels}
        activeTab={labels[activeIndex]}
        onChange={(_, index) => setActiveTab(ADMIN_EVENT_TABS[index].id)}
      />

      <div role="tabpanel" aria-label={ADMIN_EVENT_TABS[activeIndex].label} className="mt-4">
        {isLoading ? (
          <ListSkeleton />
        ) : isError ? (
          <div className="rounded-card border border-border-card bg-surface px-6 py-12 text-center">
            <p className="text-sm text-ink-muted" role="alert">
              Could not load events.
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="mt-3 cursor-pointer text-sm font-semibold text-primary disabled:cursor-wait disabled:opacity-60"
            >
              Try again
            </button>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center rounded-card border border-dashed border-border-card bg-surface px-6 py-12 text-center">
            <CalendarDays className="h-8 w-8 text-ink-inactive" aria-hidden />
            <p className="mt-3 text-sm font-medium text-ink-secondary">
              {EMPTY_COPY[activeTab].title}
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              {EMPTY_COPY[activeTab].body}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border-card rounded-card border border-border-card bg-surface">
            {rows.map((event) => (
              <EventRow key={event.id} event={event} now={now} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
