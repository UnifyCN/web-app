"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown, Info } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/ToastProvider";
import { FormError } from "@/components/auth/FormError";
import { useCreateAdminEvent } from "@/hooks/useAdminEvents";
import { DuplicateEventLinkError } from "@/services/adminEvents";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { EVENT_PARTNERS } from "@/lib/admin/eventPartners";
import {
  EMPTY_EVENT_FORM,
  EVENT_FORMAT_OPTIONS,
  EVENT_TOPIC_OPTIONS,
  SAVED_TOAST,
  TITLE_MAX,
  mapSaveError,
  showsAddress,
  validateEventForm,
  visibilityHints,
  withEventType,
  type EventFormField,
  type EventFormState,
} from "@/lib/admin/eventForm";
import type { EventGenre } from "@/types";
import { cn } from "@/lib/utils";

/*
 * /admin/events/new — add a team event (spec #142, slice #144). One form, one
 * insert into public.events under the admin RLS policy. The admin layout already
 * 404s non-admins. English only (spec D8). The cover photo arrives in #147.
 */

/** The element each field's error message moves focus to, in form order. */
const FOCUS_TARGET: Record<EventFormField, string> = {
  title: "event-title",
  start: "event-start-date",
  end: "event-end-time",
  eventType: "event-format-in-person",
  location: "event-location",
  genre: "event-genre",
  externalLink: "event-link",
  partnerSlug: "event-partner",
};
const FIELD_ORDER = Object.keys(FOCUS_TARGET) as EventFormField[];

/** Shared look for the native controls that have no components/ui part (textarea, select). */
const CONTROL =
  "w-full rounded-xl bg-surface-gray text-base text-ink-secondary outline-none transition-shadow placeholder:text-ink-placeholder focus:ring-2 focus:ring-primary/40";

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-border-card bg-surface p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-ink-secondary">{title}</h2>
      {description && (
        <p className="mt-0.5 text-xs text-ink-muted">{description}</p>
      )}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Field({
  id,
  label,
  optional,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  optional?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-sm font-medium text-ink-secondary"
      >
        {label}
        {optional && (
          <span className="ms-1 font-normal text-ink-placeholder">
            (optional)
          </span>
        )}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-ink-muted">
          {hint}
        </p>
      )}
      <FormError className="mt-1.5">
        {error && <span id={`${id}-error`}>{error}</span>}
      </FormError>
    </div>
  );
}

/** aria wiring for a control inside <Field>. */
function describedBy(id: string, error?: string, hint?: boolean) {
  return {
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `${id}-error` : hint ? `${id}-hint` : undefined,
  } as const;
}

function SelectControl({
  id,
  value,
  onChange,
  error,
  children,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          CONTROL,
          "h-14 cursor-pointer appearance-none ps-4 pe-10",
          value === "" && "text-ink-placeholder",
          error && "ring-2 ring-destructive/60",
        )}
        {...describedBy(id, error)}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute end-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
        aria-hidden
      />
    </div>
  );
}

export default function NewAdminEventPage() {
  const router = useRouter();
  const toast = useToast();
  const createEvent = useCreateAdminEvent();

  const [form, setForm] = useState<EventFormState>(EMPTY_EVENT_FORM);
  // Errors show after the first Save attempt, then update live as fields change.
  const [submitted, setSubmitted] = useState(false);
  // One clock per mount, so renders stay pure (the hints depend on it).
  const [now] = useState(() => new Date());

  const validation = validateEventForm(form);
  const errors = submitted && !validation.ok ? validation.errors : {};
  const hints = visibilityHints(form, now);
  const saveError = createEvent.error ? mapSaveError(createEvent.error) : null;
  const existingEventId =
    createEvent.error instanceof DuplicateEventLinkError
      ? createEvent.error.existingEventId
      : null;
  const busy = createEvent.isPending || createEvent.isSuccess;

  function update(next: EventFormState) {
    setForm(next);
    // A save error describes the values that were saved; clear it once they change.
    if (createEvent.error) createEvent.reset();
  }

  function set<K extends keyof EventFormState>(key: K, value: EventFormState[K]) {
    update({ ...form, [key]: value });
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setSubmitted(true);

    if (!validation.ok) {
      const first = FIELD_ORDER.find((field) => validation.errors[field]);
      if (first) document.getElementById(FOCUS_TARGET[first])?.focus();
      return;
    }

    createEvent.mutate(validation.payload, {
      onSuccess: () => {
        toast.success(SAVED_TOAST);
        router.push("/admin/events");
      },
    });
  }

  return (
    <div className="mx-auto max-w-[720px] animate-fade-in px-4 py-6 sm:px-6">
      <Link
        href="/admin/events"
        className="inline-flex items-center gap-1.5 rounded text-sm font-medium text-ink-muted transition-colors duration-200 hover:text-ink focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Events admin
      </Link>

      <header className="mt-3">
        <h1 className="text-xl font-semibold text-ink-secondary">Add event</h1>
        <p className="mt-1 text-sm text-ink-muted">
          It goes live in the Unify apps when you save. Times are Pacific.
        </p>
      </header>

      {!isSupabaseConfigured() && (
        <p className="mt-4 rounded-lg border border-border-card bg-surface-card px-4 py-3 text-xs text-ink-muted">
          Supabase is not configured in this environment, so the event cannot
          be saved.
        </p>
      )}

      <form noValidate onSubmit={handleSubmit} className="mt-5 space-y-4">
        <Section title="Event">
          <Field
            id="event-title"
            label="Title"
            error={errors.title}
          >
            <Input
              id="event-title"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              maxLength={TITLE_MAX}
              placeholder="Resume workshop for newcomers"
              autoComplete="off"
              error={!!errors.title}
              {...describedBy("event-title", errors.title)}
            />
          </Field>

          <Field id="event-description" label="Description" optional>
            <textarea
              id="event-description"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={5}
              placeholder="What happens at the event, who it is for, what to bring."
              className={cn(CONTROL, "block min-h-32 resize-y px-4 py-3 leading-relaxed")}
            />
          </Field>
        </Section>

        <Section title="When" description="Pacific time (Vancouver).">
          <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2">
            <Field id="event-start-date" label="Start date" error={errors.start}>
              <Input
                id="event-start-date"
                type="date"
                value={form.startDate}
                onChange={(e) => set("startDate", e.target.value)}
                error={!!errors.start}
                {...describedBy("event-start-date", errors.start)}
              />
            </Field>
            <Field id="event-start-time" label="Start time">
              <Input
                id="event-start-time"
                type="time"
                value={form.startTime}
                onChange={(e) => set("startTime", e.target.value)}
                error={!!errors.start}
                aria-invalid={errors.start ? true : undefined}
                aria-describedby={errors.start ? "event-start-date-error" : undefined}
              />
            </Field>
            <Field
              id="event-end-date"
              label="End date"
              optional
              hint="Leave blank when it ends on the start date."
            >
              <Input
                id="event-end-date"
                type="date"
                value={form.endDate}
                onChange={(e) => set("endDate", e.target.value)}
                error={!!errors.end}
                // The end error renders under End time; point this input at it too
                // (and keep the hint, which stays visible).
                aria-invalid={errors.end ? true : undefined}
                aria-describedby={
                  errors.end
                    ? "event-end-time-error event-end-date-hint"
                    : "event-end-date-hint"
                }
              />
            </Field>
            <Field id="event-end-time" label="End time" optional error={errors.end}>
              <Input
                id="event-end-time"
                type="time"
                value={form.endTime}
                onChange={(e) => set("endTime", e.target.value)}
                error={!!errors.end}
                {...describedBy("event-end-time", errors.end)}
              />
            </Field>
          </div>
        </Section>

        <Section title="Where">
          <fieldset
            aria-describedby={errors.eventType ? "event-format-error" : undefined}
          >
            <legend className="mb-1.5 block text-sm font-medium text-ink-secondary">
              Format
            </legend>
            <div className="grid grid-cols-3 gap-2">
              {EVENT_FORMAT_OPTIONS.map((option) => {
                const checked = form.eventType === option.value;
                return (
                  <label
                    key={option.value}
                    className={cn(
                      "flex h-11 cursor-pointer items-center justify-center rounded-xl border px-2 text-center text-sm font-medium",
                      "transition-colors duration-200 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary has-[:focus-visible]:ring-offset-2",
                      checked
                        ? "border-primary bg-primary-bg text-primary"
                        : "border-border-card bg-surface text-ink-muted hover:bg-surface-gray hover:text-ink",
                      errors.eventType && !checked && "border-destructive/60",
                    )}
                  >
                    <input
                      id={`event-format-${option.value}`}
                      type="radio"
                      name="event-format"
                      value={option.value}
                      checked={checked}
                      onChange={() => update(withEventType(form, option.value))}
                      className="sr-only"
                    />
                    {option.label}
                  </label>
                );
              })}
            </div>
            <FormError className="mt-1.5">
              {errors.eventType && (
                <span id="event-format-error">{errors.eventType}</span>
              )}
            </FormError>
          </fieldset>

          <Field id="event-location" label="Venue name" error={errors.location}>
            <Input
              id="event-location"
              value={form.location}
              onChange={(e) => set("location", e.target.value)}
              placeholder="Burnaby Public Library"
              error={!!errors.location}
              {...describedBy("event-location", errors.location)}
            />
          </Field>

          {showsAddress(form.eventType) && (
            <Field id="event-address" label="Street address" optional>
              <Input
                id="event-address"
                value={form.address}
                onChange={(e) => set("address", e.target.value)}
                placeholder="6100 Willingdon Ave, Burnaby, BC"
                autoComplete="off"
              />
            </Field>
          )}
        </Section>

        <Section title="Details">
          <Field id="event-hosted-by" label="Hosted by" optional>
            <Input
              id="event-hosted-by"
              value={form.hostedBy}
              onChange={(e) => set("hostedBy", e.target.value)}
              placeholder="Unify"
            />
          </Field>

          <Field id="event-genre" label="Topic" error={errors.genre}>
            <SelectControl
              id="event-genre"
              value={form.genre}
              onChange={(value) => set("genre", value as EventGenre | "")}
              error={errors.genre}
            >
              <option value="" disabled>
                Choose a topic
              </option>
              {EVENT_TOPIC_OPTIONS.map((genre) => (
                <option key={genre} value={genre}>
                  {genre}
                </option>
              ))}
            </SelectControl>
          </Field>

          <Field
            id="event-link"
            label="Registration or info link"
            hint="Luma, Eventbrite, a Google Form, or the event page."
            error={errors.externalLink}
          >
            <Input
              id="event-link"
              type="url"
              inputMode="url"
              value={form.externalLink}
              onChange={(e) => set("externalLink", e.target.value)}
              placeholder="https://lu.ma/…"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              error={!!errors.externalLink}
              {...describedBy("event-link", errors.externalLink, true)}
            />
          </Field>
        </Section>

        <Section title="Visibility">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <label
                htmlFor="event-featured"
                className="block cursor-pointer text-sm font-medium text-ink-secondary"
              >
                Feature on unifysocial.ca
              </label>
              <p className="mt-0.5 text-xs text-ink-muted">
                Shows the event in the featured band on the website.
              </p>
            </div>
            <Switch
              id="event-featured"
              checked={form.isFeatured}
              onChange={(next) => set("isFeatured", next)}
            />
          </div>

          <Field id="event-partner" label="Partner" optional error={errors.partnerSlug}>
            <SelectControl
              id="event-partner"
              value={form.partnerSlug}
              onChange={(value) => set("partnerSlug", value)}
              error={errors.partnerSlug}
            >
              <option value="">None</option>
              {EVENT_PARTNERS.map((partner) => (
                <option key={partner.slug} value={partner.slug}>
                  {partner.name}
                </option>
              ))}
            </SelectControl>
          </Field>

          {(hints.notOnLanding || hints.laterInApps) && (
            <ul className="space-y-2 rounded-xl bg-primary-bg px-4 py-3" aria-live="polite">
              {[hints.notOnLanding, hints.laterInApps]
                .filter((hint): hint is string => hint !== null)
                .map((hint) => (
                  <li
                    key={hint}
                    className="flex gap-2 text-sm leading-snug text-ink-tertiary"
                  >
                    <Info
                      className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                      aria-hidden
                    />
                    <span>{hint}</span>
                  </li>
                ))}
            </ul>
          )}
        </Section>

        <div className="space-y-3 pt-1">
          <FormError>
            {saveError && (
              <>
                {saveError.message}
                {saveError.kind === "duplicate" && existingEventId !== null && (
                  <>
                    {" "}
                    <Link
                      href={`/admin/events/${existingEventId}`}
                      className="font-semibold underline underline-offset-2 hover:text-ink"
                    >
                      Open that event
                    </Link>
                  </>
                )}
              </>
            )}
          </FormError>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Link
              href="/admin/events"
              className={cn(
                "inline-flex h-10 items-center justify-center rounded-lg border border-border-card bg-surface px-4",
                "text-sm font-semibold text-ink-secondary transition-colors duration-200 hover:bg-surface-gray",
                "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none",
              )}
            >
              Cancel
            </Link>
            <Button type="submit" loading={busy}>
              Save event
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
