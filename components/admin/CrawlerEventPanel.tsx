"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/ToastProvider";
import { FormError } from "@/components/auth/FormError";
import { useUpdateAdminEvent } from "@/hooks/useAdminEvents";
import {
  SAVED_TOAST,
  buildCrawlerEventUpdate,
  eventToFormState,
  visibilityHints,
  type AdminEventDetail,
  type CrawlerEventControls,
} from "@/lib/admin/eventForm";
import { formatLabel, formatPacificWhen } from "@/lib/admin/eventList";
import {
  FeatureToggle,
  Field,
  PartnerSelect,
  SECONDARY_LINK,
  SaveErrorMessage,
  Section,
  VisibilityHintList,
} from "./EventFormParts";

/*
 * /admin/events/[id] for a crawler row (`source` set): a read-only summary, with
 * only "Feature on unifysocial.ca" and "Partner" editable (spec D4). The crawler
 * owns every other field. The save sends only is_featured, partner_slug and
 * updated_at (buildCrawlerEventUpdate).
 */

function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-0.5 py-2.5 sm:grid-cols-[8rem_1fr] sm:gap-4">
      <dt className="text-xs font-medium text-ink-muted sm:text-sm">{label}</dt>
      <dd className="min-w-0 text-sm break-words text-ink-secondary">{children}</dd>
    </div>
  );
}

const None = () => <span className="text-ink-placeholder">Not set</span>;

export function CrawlerEventPanel({ event }: { event: AdminEventDetail }) {
  const router = useRouter();
  const toast = useToast();
  const updateEvent = useUpdateAdminEvent();

  const initial: CrawlerEventControls = {
    isFeatured: event.isFeatured,
    partnerSlug: event.partnerSlug?.trim() ?? "",
  };
  const [controls, setControls] = useState<CrawlerEventControls>(initial);
  const [now] = useState(() => new Date());

  const result = buildCrawlerEventUpdate(controls, now);
  const partnerError = result.ok ? undefined : result.errors.partnerSlug;
  const changed =
    controls.isFeatured !== initial.isFeatured ||
    controls.partnerSlug !== initial.partnerSlug;
  const busy = updateEvent.isPending || updateEvent.isSuccess;
  const hints = visibilityHints({ ...eventToFormState(event), ...controls }, now);
  const when = formatPacificWhen(event.eventDatetime, event.eventEndDatetime, now);

  function change(next: Partial<CrawlerEventControls>) {
    setControls({ ...controls, ...next });
    if (updateEvent.error) updateEvent.reset();
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || !changed) return;
    // Build the payload at save time, so updated_at is the moment of the save.
    const update = buildCrawlerEventUpdate(controls, new Date());
    if (!update.ok) {
      document.getElementById("event-partner")?.focus();
      return;
    }
    updateEvent.mutate(
      { kind: "crawler", id: event.id, payload: update.payload },
      {
        onSuccess: () => {
          toast.success(SAVED_TOAST);
          router.push("/admin/events");
        },
      },
    );
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="mt-5 space-y-4">
      <Section
        title="Details"
        description="The events crawler added this from a partner's website. These details cannot be changed here."
      >
        <dl className="-my-2.5 divide-y divide-border-card">
          <SummaryRow label="When (Pacific)">
            {when.date}, {when.time}
            {when.endsOn && <> until {when.endsOn}</>}
          </SummaryRow>
          <SummaryRow label="Format">{formatLabel(event.eventType)}</SummaryRow>
          <SummaryRow label="Venue">{event.location}</SummaryRow>
          <SummaryRow label="Address">{event.address || <None />}</SummaryRow>
          <SummaryRow label="Hosted by">{event.hostedBy || <None />}</SummaryRow>
          <SummaryRow label="Topic">{event.genre || <None />}</SummaryRow>
          <SummaryRow label="Link">
            <a
              href={event.externalLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex max-w-full items-center gap-1 rounded font-medium text-primary underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
            >
              <span className="truncate">{event.externalLink}</span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </SummaryRow>
          <SummaryRow label="Source">
            <code className="text-xs text-ink-muted">{event.source}</code>
          </SummaryRow>
          {event.description && (
            <SummaryRow label="Description">
              <p className="line-clamp-6 whitespace-pre-line text-ink-tertiary">
                {event.description}
              </p>
            </SummaryRow>
          )}
        </dl>
      </Section>

      <Section title="Visibility" description="You can change these two settings.">
        <FeatureToggle
          id="event-featured"
          checked={controls.isFeatured}
          onChange={(isFeatured) => change({ isFeatured })}
        />
        <Field id="event-partner" label="Partner" optional error={partnerError}>
          <PartnerSelect
            id="event-partner"
            value={controls.partnerSlug}
            onChange={(partnerSlug) => change({ partnerSlug })}
            error={partnerError}
          />
        </Field>
        <VisibilityHintList hints={hints} />
      </Section>

      <div className="space-y-3 pt-1">
        <FormError>
          {updateEvent.error ? <SaveErrorMessage error={updateEvent.error} /> : null}
        </FormError>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Link href="/admin/events" className={SECONDARY_LINK}>
            Cancel
          </Link>
          <Button type="submit" loading={busy} disabled={!changed || !!partnerError}>
            Save changes
          </Button>
        </div>
      </div>
    </form>
  );
}
