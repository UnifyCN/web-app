"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FormError } from "@/components/auth/FormError";
import {
  EVENT_FORMAT_OPTIONS,
  EVENT_TOPIC_OPTIONS,
  TITLE_MAX,
  showsAddress,
  validateEventForm,
  visibilityHints,
  withEventType,
  type EventFormField,
  type EventFormState,
} from "@/lib/admin/eventForm";
import type { EventGenre } from "@/types";
import { cn } from "@/lib/utils";
import {
  CONTROL,
  FeatureToggle,
  Field,
  PartnerSelect,
  SECONDARY_LINK,
  SaveErrorMessage,
  Section,
  SelectControl,
  VisibilityHintList,
  describedBy,
} from "./EventFormParts";
import {
  CoverPhotoField,
  KEEP_COVER_DRAFT,
  type CoverDraft,
} from "./CoverPhotoField";

/*
 * The team-event form (spec #142, "Form → row mapping"), shared by
 * /admin/events/new (empty) and /admin/events/[id] (prefilled from the row). It owns
 * the field state and shows validation; the page owns the save: `onSubmit` runs only
 * when validateEventForm passes, and the page builds the insert or update payload.
 * The cover photo (#147) is a separate draft: picked here, uploaded by the save.
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

export interface EventFormProps {
  initialState: EventFormState;
  /** The stored `cover_photo_url` (edit page); null or omitted on the add page. */
  initialCoverUrl?: string | null;
  submitLabel: string;
  /** The save is running, or has succeeded and the page is leaving. */
  busy: boolean;
  /** The last failed save (a PostgREST error or DuplicateEventLinkError), if any. */
  saveError: unknown;
  /** Called on every change, so the page can clear a save error about old values. */
  onEdit: () => void;
  /** Called with the form state (once it passes validation) and the cover draft. */
  onSubmit: (state: EventFormState, cover: CoverDraft) => void;
  /** Another message for the action row (e.g. a failed delete). */
  actionError?: string | null;
  /** Shown at the start of the action row (e.g. Delete on the edit page). */
  secondaryAction?: React.ReactNode;
}

export function EventForm({
  initialState,
  initialCoverUrl = null,
  submitLabel,
  busy,
  saveError,
  onEdit,
  onSubmit,
  actionError,
  secondaryAction,
}: EventFormProps) {
  const [form, setForm] = useState<EventFormState>(initialState);
  const [cover, setCover] = useState<CoverDraft>(KEEP_COVER_DRAFT);
  // Errors show after the first Save attempt, then update live as fields change.
  const [submitted, setSubmitted] = useState(false);
  // One clock per mount, so renders stay pure (the hints depend on it).
  const [now] = useState(() => new Date());

  const validation = validateEventForm(form);
  const errors = submitted && !validation.ok ? validation.errors : {};
  const hints = visibilityHints(form, now);

  function update(next: EventFormState) {
    setForm(next);
    onEdit();
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
    onSubmit(form, cover);
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="mt-5 space-y-4">
      <Section title="Event">
        <Field id="event-title" label="Title" error={errors.title}>
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

      <Section
        title="Cover photo"
        description="Optional. Shows on the event in the Unify apps and on unifysocial.ca."
      >
        <CoverPhotoField
          initialUrl={initialCoverUrl}
          draft={cover}
          onChange={(next) => {
            setCover(next);
            onEdit();
          }}
          disabled={busy}
        />
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
        <FeatureToggle
          id="event-featured"
          checked={form.isFeatured}
          onChange={(next) => set("isFeatured", next)}
        />

        <Field id="event-partner" label="Partner" optional error={errors.partnerSlug}>
          <PartnerSelect
            id="event-partner"
            value={form.partnerSlug}
            onChange={(value) => set("partnerSlug", value)}
            error={errors.partnerSlug}
          />
        </Field>

        <VisibilityHintList hints={hints} />
      </Section>

      <div className="space-y-3 pt-1">
        <FormError>
          {saveError ? (
            <SaveErrorMessage error={saveError} />
          ) : actionError ? (
            actionError
          ) : null}
        </FormError>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
          {secondaryAction && (
            <div className="flex flex-col sm:me-auto sm:flex-row">
              {secondaryAction}
            </div>
          )}
          <Link href="/admin/events" className={SECONDARY_LINK}>
            Cancel
          </Link>
          <Button type="submit" loading={busy}>
            {submitLabel}
          </Button>
        </div>
      </div>
    </form>
  );
}
