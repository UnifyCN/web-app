"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { CalendarX2, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { useToast } from "@/components/ui/ToastProvider";
import { AdminEventHeader } from "@/components/admin/AdminEventHeader";
import { CrawlerEventPanel } from "@/components/admin/CrawlerEventPanel";
import { EventForm } from "@/components/admin/EventForm";
import { SECONDARY_LINK } from "@/components/admin/EventFormParts";
import {
  useAdminEvent,
  useDeleteAdminEvent,
  useUpdateAdminEvent,
} from "@/hooks/useAdminEvents";
import {
  DELETED_TOAST,
  DELETE_FAILED_MESSAGE,
  SAVED_TOAST,
  buildTeamEventUpdate,
  eventToFormState,
  parseEventId,
  type AdminEventDetail,
  type EventFormState,
} from "@/lib/admin/eventForm";
import { isTeamEvent } from "@/lib/admin/eventList";

/*
 * /admin/events/[id] — one event (spec #142, slice #145). The admin layout already
 * 404s non-admins. English only (spec D8).
 *
 * - Team row (`source is null`): the add form, prefilled (UTC → Pacific), with the
 *   same validation; Save updates the row. Delete asks first, then hard-deletes.
 * - Crawler row: a read-only summary; only Feature and Partner can change
 *   (CrawlerEventPanel). No delete: the crawler would re-add the row.
 * - A malformed id or a missing row: a not-found state.
 */

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[720px] animate-fade-in px-4 py-6 sm:px-6">
      {children}
    </div>
  );
}

function NotFoundState() {
  return (
    <PageShell>
      <AdminEventHeader title="Event not found" />
      <div className="mt-5 flex flex-col items-center rounded-card border border-dashed border-border-card bg-surface px-6 py-12 text-center">
        <CalendarX2 className="h-8 w-8 text-ink-inactive" aria-hidden />
        <p className="mt-3 text-sm font-medium text-ink-secondary">
          There is no event at this address.
        </p>
        <p className="mt-1 max-w-sm text-xs text-ink-muted">
          It may have been deleted, or the link is wrong.
        </p>
        <Link href="/admin/events" className={`mt-5 ${SECONDARY_LINK}`}>
          Back to events
        </Link>
      </div>
    </PageShell>
  );
}

function FormSkeleton() {
  return (
    <div className="mt-5 space-y-4" aria-hidden>
      {[3, 2, 2].map((rows, i) => (
        <div
          key={i}
          className="animate-pulse space-y-4 rounded-card border border-border-card bg-surface p-4 sm:p-5"
        >
          <div className="h-3.5 w-24 rounded bg-surface-gray" />
          {Array.from({ length: rows }).map((_, j) => (
            <div key={j} className="h-12 rounded-xl bg-surface-gray" />
          ))}
        </div>
      ))}
    </div>
  );
}

type DeleteMutation = ReturnType<typeof useDeleteAdminEvent>;

function TeamEventEditor({
  event,
  deleteEvent,
}: {
  event: AdminEventDetail;
  /** Owned by the page, so it can stop showing (and refetching) a deleted event. */
  deleteEvent: DeleteMutation;
}) {
  const router = useRouter();
  const toast = useToast();
  const updateEvent = useUpdateAdminEvent();
  const [confirmOpen, setConfirmOpen] = useState(false);
  // The prefill is computed once; a background refetch must not reset typed values.
  const [initialState] = useState(() => eventToFormState(event));

  const leaving = updateEvent.isSuccess || deleteEvent.isSuccess;

  function handleSubmit(state: EventFormState) {
    const result = buildTeamEventUpdate(state, new Date());
    if (!result.ok) return; // EventForm only submits a valid form
    deleteEvent.reset();
    updateEvent.mutate(
      { kind: "team", id: event.id, payload: result.payload },
      {
        onSuccess: () => {
          toast.success(SAVED_TOAST);
          router.push("/admin/events");
        },
      },
    );
  }

  function handleDelete() {
    updateEvent.reset();
    deleteEvent.mutate(event.id, {
      onSuccess: () => {
        setConfirmOpen(false);
        toast.success(DELETED_TOAST);
        router.push("/admin/events");
      },
      onError: () => setConfirmOpen(false),
    });
  }

  return (
    <>
      <EventForm
        initialState={initialState}
        submitLabel="Save changes"
        busy={updateEvent.isPending || leaving}
        saveError={updateEvent.error}
        actionError={deleteEvent.error ? DELETE_FAILED_MESSAGE : null}
        onEdit={() => {
          if (updateEvent.error) updateEvent.reset();
          if (deleteEvent.error) deleteEvent.reset();
        }}
        onSubmit={handleSubmit}
        secondaryAction={
          <Button
            type="button"
            variant="secondary"
            className="text-destructive hover:bg-destructive/5"
            leftIcon={<Trash2 className="h-4 w-4" aria-hidden />}
            onClick={() => setConfirmOpen(true)}
            disabled={updateEvent.isPending || leaving}
          >
            Delete event
          </Button>
        }
      />

      <ConfirmModal
        open={confirmOpen}
        title="Delete this event?"
        description={
          <>
            “{event.title}” will be removed from the Unify apps and
            unifysocial.ca. This cannot be undone.
          </>
        }
        confirmLabel="Delete event"
        cancelLabel="Cancel"
        isPending={deleteEvent.isPending}
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}

export default function AdminEventPage() {
  const params = useParams<{ id: string }>();
  const id = parseEventId(params.id);
  const deleteEvent = useDeleteAdminEvent();
  const deleted = deleteEvent.isSuccess;
  const { data: event, isLoading, isError, refetch, isFetching } =
    useAdminEvent(id, { enabled: !deleted });

  if (id === null) return <NotFoundState />;

  // The row is gone and the page is on its way back to the list.
  if (deleted) {
    return (
      <PageShell>
        <AdminEventHeader title="Event deleted" subtitle="Going back to the events list…" />
      </PageShell>
    );
  }

  if (isLoading) {
    return (
      <PageShell>
        <AdminEventHeader title="Edit event" />
        <FormSkeleton />
      </PageShell>
    );
  }

  if (isError) {
    return (
      <PageShell>
        <AdminEventHeader title="Edit event" />
        <div className="mt-5 rounded-card border border-border-card bg-surface px-6 py-12 text-center">
          <p className="text-sm text-ink-muted" role="alert">
            Could not load this event.
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
      </PageShell>
    );
  }

  if (!event) return <NotFoundState />;

  if (!isTeamEvent(event)) {
    return (
      <PageShell>
        <AdminEventHeader
          title={event.title}
          eyebrow={<Badge>From partners</Badge>}
          subtitle="Only the Feature setting and the partner can be changed."
        />
        <CrawlerEventPanel key={event.id} event={event} />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <AdminEventHeader
        title="Edit event"
        eyebrow={<Badge>Added by team</Badge>}
        subtitle="Changes go live in the Unify apps when you save. Times are Pacific."
      />
      <TeamEventEditor key={event.id} event={event} deleteEvent={deleteEvent} />
    </PageShell>
  );
}
