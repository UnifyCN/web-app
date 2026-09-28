"use client";

import { useState } from "react";
import { Building2, ChevronDown, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/ToastProvider";
import { FormError } from "@/components/auth/FormError";
import { useUpdateEventVisibility } from "@/hooks/useAdminEventVisibility";
import { SAVED_TOAST, mapSaveError } from "@/lib/admin/eventForm";
import type { AdminEvent } from "@/lib/admin/eventList";
import { EVENT_PARTNERS, isKnownPartnerSlug } from "@/lib/admin/eventPartners";
import {
  planVisibilityEdit,
  type VisibilityChange,
} from "@/lib/admin/eventVisibility";
import { cn } from "@/lib/utils";

/*
 * The inline "Feature" switch and partner dropdown on each /admin/events row (#146),
 * on both tabs. A change saves at once: the row shows the new value, its controls
 * are disabled until the save ends, and a failed save puts the old value back and
 * shows why under the row.
 */

export function EventVisibilityControls({
  event,
  trailing,
}: {
  event: AdminEvent;
  /** Extra row actions (Edit, Delete) placed after the controls. */
  trailing?: React.ReactNode;
}) {
  const toast = useToast();
  const save = useUpdateEventVisibility();
  // A change the builder rejects never reaches the server; its message shows here.
  const [invalid, setInvalid] = useState<string | null>(null);
  const busy = save.isPending;

  const partnerValue = event.partnerSlug?.trim() ?? "";
  const unknownPartner = partnerValue !== "" && !isKnownPartnerSlug(partnerValue);
  const switchId = `event-${event.id}-featured`;
  const errorId = `event-${event.id}-visibility-error`;

  const error = invalid ?? (save.error ? mapSaveError(save.error).message : null);

  function change(next: VisibilityChange) {
    if (busy) return;
    setInvalid(null);
    save.reset();
    // Built at the moment of the change, so updated_at is the time of the save.
    const plan = planVisibilityEdit(event, next, new Date());
    if (plan.kind === "invalid") {
      setInvalid(plan.message);
      return;
    }
    if (plan.kind === "unchanged") return;
    save.mutate(plan, { onSuccess: () => toast.success(SAVED_TOAST) });
  }

  return (
    <div className="min-w-0">
      {/* Phone: Feature + Edit/Delete on one line, the dropdown full width
          below it. From sm up: one line, in DOM order. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
        <div className="order-1 flex items-center gap-2.5">
          <Switch
            id={switchId}
            checked={event.isFeatured}
            onChange={(isFeatured) => change({ isFeatured })}
            disabled={busy}
            aria-label={`Feature ${event.title} on unifysocial.ca`}
          />
          <label
            htmlFor={switchId}
            className={cn(
              "text-sm font-medium select-none",
              busy ? "cursor-not-allowed text-ink-muted" : "cursor-pointer text-ink-secondary",
            )}
          >
            Feature
          </label>
        </div>

        <div className="relative order-3 min-w-0 basis-full sm:order-2 sm:max-w-64 sm:flex-1 sm:basis-40">
          <Building2
            className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
            aria-hidden
          />
          <select
            value={partnerValue}
            onChange={(e) => change({ partnerSlug: e.target.value })}
            disabled={busy}
            aria-label={`Partner for ${event.title}`}
            // Only a rejected partner is the dropdown's fault; a failed save is not.
            aria-invalid={invalid ? true : undefined}
            aria-describedby={invalid ? errorId : undefined}
            className={cn(
              // text-base below sm keeps iOS Safari from zooming in on focus.
              "h-9 w-full cursor-pointer appearance-none truncate rounded-lg bg-surface-gray ps-9 pe-8",
              "text-base text-ink-secondary outline-none transition-shadow duration-200 sm:text-sm",
              "focus-visible:ring-2 focus-visible:ring-primary/40",
              "disabled:cursor-not-allowed disabled:opacity-60",
              partnerValue === "" && "text-ink-muted",
              invalid && "ring-2 ring-destructive/60",
            )}
          >
            <option value="">None</option>
            {unknownPartner && (
              <option value={partnerValue}>{partnerValue} (not in the list)</option>
            )}
            {EVENT_PARTNERS.map((partner) => (
              <option key={partner.slug} value={partner.slug}>
                {partner.name}
              </option>
            ))}
          </select>
          {/* The row's save indicator sits in the chevron's place, so nothing moves. */}
          {busy ? (
            <Loader2
              className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-primary"
              aria-hidden
            />
          ) : (
            <ChevronDown
              className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
              aria-hidden
            />
          )}
        </div>

        <span className="sr-only" aria-live="polite">
          {busy ? "Saving…" : ""}
        </span>

        {trailing && <div className="order-2 ms-auto sm:order-3">{trailing}</div>}
      </div>

      <FormError className="mt-2 text-xs">
        {error && <span id={errorId}>{error}</span>}
      </FormError>
    </div>
  );
}
