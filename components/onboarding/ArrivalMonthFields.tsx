"use client";

import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";

const SELECT_CLASS =
  "h-11 w-full appearance-none rounded-lg border border-border-card bg-surface px-3 pe-10 text-sm text-ink-muted " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50";

const CHEVRON_CLASS =
  "pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-placeholder";

type Parts = { month: number | null; year: number | null; day?: number | null };

/**
 * Arrival month + year selects, shared by the onboarding step and the
 * one-time arrival-month prompt. Years run ten ahead (a planned arrival, as on
 * mobile) down to 40 back; a future month puts the user on the pre-arrival
 * track. Passing `day` adds a day select (the Checklist's arrival-date dialog,
 * which, as on mobile, takes an exact day); `years` narrows the year list.
 */
export function ArrivalMonthFields({
  month,
  year,
  day,
  years: yearBounds,
  onChange,
  disabled = false,
}: {
  month: number | null;
  year: number | null;
  day?: number | null;
  years?: { from: number; to: number };
  onChange: (next: Parts) => void;
  disabled?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const thisYear = new Date().getFullYear();
  const yearTo = yearBounds?.to ?? thisYear + 10;
  const yearFrom = yearBounds?.from ?? thisYear - 40;
  const years = [...Array(yearTo - yearFrom + 1).keys()].map((i) => yearTo - i);
  const withDay = day !== undefined;
  const dayCount =
    month !== null && year !== null ? new Date(year, month, 0).getDate() : 31;
  // Keep the picked day valid when the month or year shrinks it (31 -> 30).
  const emit = (next: Parts) => {
    if (!withDay) return onChange({ month: next.month, year: next.year });
    const max =
      next.month !== null && next.year !== null
        ? new Date(next.year, next.month, 0).getDate()
        : 31;
    onChange({ ...next, day: next.day != null ? Math.min(next.day, max) : null });
  };
  // Month names localized to the active language (no translation keys needed).
  const monthFmt = new Intl.DateTimeFormat(i18n.language, { month: "long" });
  const months = [...Array(12).keys()].map((i) =>
    monthFmt.format(new Date(2021, i, 1)),
  );

  return (
    <div className={withDay ? "grid grid-cols-[1fr_1.4fr_1.1fr] gap-2" : "grid grid-cols-2 gap-3"}>
      {withDay && (
        <div className="relative">
          <select
            aria-label={t("onboardingWeb.arrival.ariaDay")}
            className={SELECT_CLASS}
            value={day ?? ""}
            disabled={disabled}
            onChange={(e) =>
              emit({
                month,
                year,
                day: e.target.value ? Number(e.target.value) : null,
              })
            }
          >
            <option value="">{t("onboardingWeb.arrival.dayLabel")}</option>
            {[...Array(dayCount).keys()].map((i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
          <ChevronDown className={CHEVRON_CLASS} aria-hidden />
        </div>
      )}
      <div className="relative">
        <select
          aria-label={t("onboardingWeb.arrival.ariaMonth")}
          className={SELECT_CLASS}
          value={month ?? ""}
          disabled={disabled}
          onChange={(e) =>
            emit({
              month: e.target.value ? Number(e.target.value) : null,
              year,
              day,
            })
          }
        >
          <option value="">{t("onboarding.monthLabel")}</option>
          {months.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
        <ChevronDown className={CHEVRON_CLASS} aria-hidden />
      </div>

      <div className="relative">
        <select
          aria-label={t("onboardingWeb.arrival.ariaYear")}
          className={SELECT_CLASS}
          value={year ?? ""}
          disabled={disabled}
          onChange={(e) =>
            emit({
              month,
              year: e.target.value ? Number(e.target.value) : null,
              day,
            })
          }
        >
          <option value="">{t("onboarding.yearLabel")}</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <ChevronDown className={CHEVRON_CLASS} aria-hidden />
      </div>
    </div>
  );
}
