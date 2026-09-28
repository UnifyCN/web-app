"use client";

import { useRouter } from "next/navigation";
import { EventForm } from "@/components/admin/EventForm";
import type { CoverDraft } from "@/components/admin/CoverPhotoField";
import { AdminEventHeader } from "@/components/admin/AdminEventHeader";
import { useToast } from "@/components/ui/ToastProvider";
import { useCreateAdminEvent } from "@/hooks/useAdminEvents";
import {
  EMPTY_EVENT_FORM,
  SAVED_TOAST,
  validateEventForm,
  type EventFormState,
} from "@/lib/admin/eventForm";

/*
 * /admin/events/new — add a team event (spec #142, slice #144). One form, one
 * insert into public.events under the admin RLS policy. The admin layout already
 * 404s non-admins. English only (spec D8). A picked cover photo uploads on Save, before
 * the insert (#147). The form itself is shared with the edit page
 * (components/admin/EventForm.tsx).
 */

export default function NewAdminEventPage() {
  const router = useRouter();
  const toast = useToast();
  const createEvent = useCreateAdminEvent();

  function handleSubmit(state: EventFormState, cover: CoverDraft) {
    const result = validateEventForm(state);
    if (!result.ok) return; // EventForm only submits a valid form
    const coverFile = cover.kind === "replace" ? cover.file : null;
    createEvent.mutate({ payload: result.payload, coverFile }, {
      onSuccess: () => {
        toast.success(SAVED_TOAST);
        router.push("/admin/events");
      },
    });
  }

  return (
    <div className="mx-auto max-w-[720px] animate-fade-in px-4 py-6 sm:px-6">
      <AdminEventHeader
        title="Add event"
        subtitle="It goes live in the Unify apps when you save. Times are Pacific."
      />
      <EventForm
        initialState={EMPTY_EVENT_FORM}
        submitLabel="Save event"
        busy={createEvent.isPending || createEvent.isSuccess}
        saveError={createEvent.error}
        onEdit={() => {
          // A save error describes the values that were saved; clear it once they change.
          if (createEvent.error) createEvent.reset();
        }}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
