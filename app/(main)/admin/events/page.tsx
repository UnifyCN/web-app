"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarDays, Pencil, Plus, Trash2 } from "lucide-react";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/ToastProvider";
import { FormError } from "@/components/auth/FormError";
import { EventVisibilityControls } from "@/components/admin/EventVisibilityControls";
import { useAdminEvents, useDeleteAdminEvent } from "@/hooks/useAdminEvents";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { DELETED_TOAST, DELETE_FAILED_MESSAGE } from "@/lib/admin/eventForm";
import {
  ADMIN_EVENT_TABS,
  formatLabel,
  formatPacificWhen,
  isTeamEvent,
  splitByTab,
  type AdminEvent,
  type AdminEventTab,
} from "@/lib/admin/eventList";
import { cn } from "@/lib/utils";

/*
 * /admin/events — the list of every event that has not ended (spec #142, slices
 * #143, #145 and #146). The admin layout already 404s non-admins. English only
 * (spec D8). Every row opens /admin/events/[id] and has an inline "Feature" switch
 * and partner dropdown that save at once (#146). Rows on the "Added by team" tab
 * also get Edit and Delete (crawler rows are never deletable).
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

/** Edit + Delete, for team rows only. */
function TeamRowActions({
  event,
  onDelete,
}: {
  event: AdminEvent;
  onDelete: (event: AdminEvent) => void;
}) {
  return (
    <div className="-me-2.5 flex items-center gap-1">
      <Link
        href={`/admin/events/${event.id}`}
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-ink-muted",
          "transition-colors duration-200 hover:bg-surface-gray hover:text-ink",
          "focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none",
        )}
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden />
        Edit
        <span className="sr-only">“{event.title}”</span>
      </Link>
      <button
        type="button"
        onClick={() => onDelete(event)}
        className={cn(
          "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-ink-muted",
          "transition-colors duration-200 hover:bg-destructive/5 hover:text-destructive",
          "focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none",
        )}
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden />
        Delete
        <span className="sr-only">“{event.title}”</span>
      </button>
    </div>
  );
}

function EventRow({
  event,
  now,
  actions,
}: {
  event: AdminEvent;
  now: Date;
  actions?: React.ReactNode;
}) {
  const when = formatPacificWhen(event.eventDatetime, event.eventEndDatetime, now);

  return (
    <li className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-4 px-4 py-3.5 sm:grid-cols-[8rem_minmax(0,1fr)] sm:px-5">
      <div>
        <p className="text-sm font-semibold text-ink-secondary">{when.date}</p>
        <p className="mt-0.5 text-xs text-ink-muted">{when.time}</p>
        {when.endsOn && (
          <p className="mt-0.5 text-xs text-ink-placeholder">
            Until {when.endsOn}
          </p>
        )}
      </div>

      <div className="min-w-0">
        <Link
          href={`/admin/events/${event.id}`}
          className="rounded text-sm font-medium break-words text-ink-secondary underline-offset-2 transition-colors duration-200 hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
        >
          {event.title}
        </Link>
        <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-ink-muted">
          <span className="shrink-0">{formatLabel(event.eventType)}</span>
          {/* An Online event's venue is "Online"; do not say it twice. */}
          {event.location &&
            event.location.trim().toLowerCase() !==
              formatLabel(event.eventType).toLowerCase() && (
            <>
              <span aria-hidden>·</span>
              <span className="truncate">{event.location}</span>
            </>
          )}
        </p>
      </div>

      {/* Feature + partner (both tabs), then Edit/Delete (team tab). Full width on a
          phone so the dropdown has room; under the title from sm up. */}
      <div className="col-span-2 mt-3 sm:col-span-1 sm:col-start-2">
        <EventVisibilityControls event={event} trailing={actions} />
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

  const toast = useToast();
  const deleteEvent = useDeleteAdminEvent();
  // The team row the admin asked to delete; the confirm modal is open while set.
  const [toDelete, setToDelete] = useState<AdminEvent | null>(null);
  // The row whose delete failed, for the inline message.
  const [failedDelete, setFailedDelete] = useState<AdminEvent | null>(null);

  function confirmDelete() {
    if (!toDelete) return;
    const target = toDelete;
    setFailedDelete(null);
    deleteEvent.mutate(target.id, {
      onSuccess: () => {
        setToDelete(null);
        toast.success(DELETED_TOAST);
      },
      onError: () => {
        setToDelete(null);
        setFailedDelete(target);
      },
    });
  }

  return (
    <div className="mx-auto max-w-[800px] px-4 py-6 sm:px-6">
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

      <FormError className="mt-4">
        {failedDelete && (
          <>
            {DELETE_FAILED_MESSAGE} (“{failedDelete.title}”)
          </>
        )}
      </FormError>

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
              <EventRow
                key={event.id}
                event={event}
                now={now}
                actions={
                  // Edit and Delete only on team rows: the delete policy (and the
                  // crawler, which would re-add the row) rule out crawler rows.
                  activeTab === "team" && isTeamEvent(event) ? (
                    <TeamRowActions event={event} onDelete={setToDelete} />
                  ) : undefined
                }
              />
            ))}
          </ul>
        )}
      </div>

      <ConfirmModal
        open={toDelete !== null}
        title="Delete this event?"
        description={
          toDelete && (
            <>
              “{toDelete.title}” will be removed from the Unify apps and
              unifysocial.ca. This cannot be undone.
            </>
          )
        }
        confirmLabel="Delete event"
        cancelLabel="Cancel"
        isPending={deleteEvent.isPending}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
