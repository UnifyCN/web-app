"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CITY_OPTIONS,
  CITY_TO_PROVINCE,
  PROVINCES,
} from "@/lib/onboarding/constants";
import { StepHeading } from "../StepHeading";
import type { OnboardingStepProps } from "../types";

const OTHER = "__other__";
const KNOWN = new Set<string>(CITY_OPTIONS);

const FIELD_CLASS =
  "h-11 w-full rounded-lg border border-border-card bg-surface px-3 text-sm text-ink-muted " +
  "placeholder:text-ink-placeholder focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

// Selects: hide the inconsistent native arrow; we draw one ChevronDown instead.
const SELECT_CLASS = cn(FIELD_CLASS, "appearance-none pr-10");

export function LocationStep({ draft, update }: OnboardingStepProps) {
  const [other, setOther] = useState(
    () => draft.city !== "" && !KNOWN.has(draft.city),
  );
  // Province was filled from a known city (and hasn't been manually changed).
  const [autoFilled, setAutoFilled] = useState(
    () =>
      draft.city !== "" &&
      KNOWN.has(draft.city) &&
      CITY_TO_PROVINCE[draft.city] === draft.province,
  );

  function onCityChange(value: string) {
    if (value === OTHER) {
      setOther(true);
      setAutoFilled(false);
      update({ city: "" });
      return;
    }
    setOther(false);
    const mapped = CITY_TO_PROVINCE[value];
    if (mapped) {
      setAutoFilled(true);
      update({ city: value, province: mapped });
    } else {
      setAutoFilled(false);
      update({ city: value });
    }
  }

  function onProvinceChange(value: string) {
    setAutoFilled(false);
    update({ province: value });
  }

  return (
    <div>
      <StepHeading
        title="Where in Canada are you?"
        subtitle="Helps surface local events, groups, and services."
      />

      <div className="mt-5 space-y-3">
        <div className="relative">
          <select
            aria-label="City"
            className={SELECT_CLASS}
            value={other ? OTHER : draft.city}
            onChange={(e) => onCityChange(e.target.value)}
          >
            <option value="">Select a city</option>
            {CITY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            <option value={OTHER}>Other…</option>
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-placeholder"
            aria-hidden
          />
        </div>

        {other && (
          <input
            type="text"
            aria-label="City name"
            placeholder="Type your city"
            value={draft.city}
            onChange={(e) => update({ city: e.target.value })}
            className={FIELD_CLASS}
          />
        )}

        <div className="relative">
          <select
            aria-label="Province or territory"
            className={cn(
              SELECT_CLASS,
              autoFilled &&
                "border-mention-blue bg-mention-blue/10 pr-24 text-mention-blue",
            )}
            value={draft.province}
            onChange={(e) => onProvinceChange(e.target.value)}
          >
            <option value="">Select a province or territory</option>
            {PROVINCES.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name}
              </option>
            ))}
          </select>
          {autoFilled ? (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-mention-blue">
              Auto-filled
            </span>
          ) : (
            <ChevronDown
              className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-placeholder"
              aria-hidden
            />
          )}
        </div>
      </div>
    </div>
  );
}
