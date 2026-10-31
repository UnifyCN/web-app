"use client";

import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { usePersonaLabel } from "@/lib/i18n/labels";
import { arrivalKey } from "@/lib/companionContext";
import type { Persona } from "@/types";

const PERSONAS = new Set(["international_student", "skilled_worker", "refugee", "other"]);

/**
 * Display text for Companion context values in the UI language: personas and
 * arrival codes are translated; dates and check times use the locale's date
 * format with a named time zone. Place and publisher names are proper names
 * and are shown as stored.
 */
export function useContextLabels() {
  const { t, i18n } = useTranslation();
  const personaLabel = usePersonaLabel();
  const lang = i18n.language || "en";

  const timeFormat = useMemo(
    () =>
      // dateStyle/timeStyle cannot be combined with timeZoneName (TypeError).
      new Intl.DateTimeFormat(lang, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      }),
    [lang],
  );
  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeZone: "UTC" }),
    [lang],
  );

  const time = useCallback((iso: string) => timeFormat.format(new Date(iso)), [timeFormat]);

  const arrival = useCallback(
    (code: string) => {
      const key = arrivalKey(code);
      return key ? t(key.key, key.number !== undefined ? { number: key.number } : undefined) : code;
    },
    [t],
  );

  const fieldValue = useCallback(
    (key: string, value: string) => {
      if (key === "persona" && PERSONAS.has(value)) return personaLabel(value as Persona);
      if (key === "arrival") return arrival(value);
      if (key === "arrival_date" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return dateFormat.format(new Date(`${value}T00:00:00Z`));
      }
      return value;
    },
    [arrival, dateFormat, personaLabel],
  );

  return { time, arrival, fieldValue };
}
