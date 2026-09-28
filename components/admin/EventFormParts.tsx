"use client";

import Link from "next/link";
import { ChevronDown, Info } from "lucide-react";
import { Switch } from "@/components/ui/Switch";
import { FormError } from "@/components/auth/FormError";
import { DuplicateEventLinkError } from "@/services/adminEvents";
import { EVENT_PARTNERS, isKnownPartnerSlug } from "@/lib/admin/eventPartners";
import { mapSaveError, type VisibilityHints } from "@/lib/admin/eventForm";
import { cn } from "@/lib/utils";

/*
 * Building blocks shared by the admin event pages: the add/edit form
 * (EventForm.tsx) and the crawler-event panel on /admin/events/[id].
 */

/** Shared look for the native controls that have no components/ui part (textarea, select). */
export const CONTROL =
  "w-full rounded-xl bg-surface-gray text-base text-ink-secondary outline-none transition-shadow placeholder:text-ink-placeholder focus:ring-2 focus:ring-primary/40";

/** Look of a secondary action rendered as a link (Cancel, Back). */
export const SECONDARY_LINK = cn(
  "inline-flex h-10 items-center justify-center rounded-lg border border-border-card bg-surface px-4",
  "text-sm font-semibold text-ink-secondary transition-colors duration-200 hover:bg-surface-gray",
  "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none",
);

export function Section({
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

export function Field({
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
export function describedBy(id: string, error?: string, hint?: boolean) {
  return {
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `${id}-error` : hint ? `${id}-hint` : undefined,
  } as const;
}

export function SelectControl({
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

/** "None" + the landing-page partners. A stored slug not in the list stays visible, marked. */
export function PartnerSelect({
  id,
  value,
  onChange,
  error,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const unknown = value.trim() !== "" && !isKnownPartnerSlug(value);
  return (
    <SelectControl id={id} value={value} onChange={onChange} error={error}>
      <option value="">None</option>
      {unknown && <option value={value}>{value} (not in the list)</option>}
      {EVENT_PARTNERS.map((partner) => (
        <option key={partner.slug} value={partner.slug}>
          {partner.name}
        </option>
      ))}
    </SelectControl>
  );
}

/** The "Feature on unifysocial.ca" row. */
export function FeatureToggle({
  id,
  checked,
  onChange,
}: {
  id: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label
          htmlFor={id}
          className="block cursor-pointer text-sm font-medium text-ink-secondary"
        >
          Feature on unifysocial.ca
        </label>
        <p className="mt-0.5 text-xs text-ink-muted">
          Shows the event in the featured band on the website.
        </p>
      </div>
      <Switch id={id} checked={checked} onChange={onChange} />
    </div>
  );
}

/** The live visibility hints (spec #142), or nothing when there are none. */
export function VisibilityHintList({ hints }: { hints: VisibilityHints }) {
  const items = [hints.notOnLanding, hints.laterInApps].filter(
    (hint): hint is string => hint !== null,
  );
  if (items.length === 0) return null;
  return (
    <ul className="space-y-2 rounded-xl bg-primary-bg px-4 py-3" aria-live="polite">
      {items.map((hint) => (
        <li
          key={hint}
          className="flex gap-2 text-sm leading-snug text-ink-tertiary"
        >
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span>{hint}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The inline message for a failed save: the duplicate-link message (with a link to
 * the event that has the link, when known) or the generic one.
 */
export function SaveErrorMessage({ error }: { error: unknown }) {
  const saveError = mapSaveError(error);
  const existingEventId =
    error instanceof DuplicateEventLinkError ? error.existingEventId : null;
  return (
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
  );
}
