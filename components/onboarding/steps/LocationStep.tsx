"use client";

import { useState } from "react";
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

export function LocationStep({ draft, update }: OnboardingStepProps) {
  const [other, setOther] = useState(
    () => draft.city !== "" && !KNOWN.has(draft.city),
  );

  function onCityChange(value: string) {
    if (value === OTHER) {
      setOther(true);
      update({ city: "" });
      return;
    }
    setOther(false);
    update({ city: value, province: CITY_TO_PROVINCE[value] ?? draft.province });
  }

  return (
    <div>
      <StepHeading
        title="Where in Canada are you?"
        subtitle="Helps surface local events, groups, and services."
      />

      <div className="mt-5 space-y-3">
        <select
          aria-label="City"
          className={FIELD_CLASS}
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

        <select
          aria-label="Province or territory"
          className={FIELD_CLASS}
          value={draft.province}
          onChange={(e) => update({ province: e.target.value })}
        >
          <option value="">Select a province or territory</option>
          {PROVINCES.map((p) => (
            <option key={p.code} value={p.code}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
