import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { StepHeading } from "../StepHeading";
import type { OnboardingStepProps } from "../types";

const SELECT_CLASS =
  "h-11 w-full appearance-none rounded-lg border border-border-card bg-surface px-3 pe-10 text-sm text-ink-muted " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50";

const CHEVRON_CLASS =
  "pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-placeholder";

export function ArrivalDateStep({ draft, update }: OnboardingStepProps) {
  const { t, i18n } = useTranslation();
  const thisYear = new Date().getFullYear();
  // Ten years ahead (a planned arrival, as on mobile) down to 40 years back.
  // A future month puts the user on the pre-arrival track.
  const years = [...Array(51).keys()].map((i) => thisYear + 10 - i);
  // Month names localized to the active language (no translation keys needed).
  const monthFmt = new Intl.DateTimeFormat(i18n.language, { month: "long" });
  const months = [...Array(12).keys()].map((i) =>
    monthFmt.format(new Date(2021, i, 1)),
  );

  return (
    <div>
      <StepHeading
        title={t("quiz.q.arrivalDate")}
        subtitle={t("onboardingWeb.arrival.subtitle")}
      />

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="relative">
          <select
            aria-label={t("onboardingWeb.arrival.ariaMonth")}
            className={SELECT_CLASS}
            value={draft.arrivalMonth ?? ""}
            onChange={(e) =>
              update({
                arrivalMonth: e.target.value ? Number(e.target.value) : null,
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
            value={draft.arrivalYear ?? ""}
            onChange={(e) =>
              update({
                arrivalYear: e.target.value ? Number(e.target.value) : null,
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
    </div>
  );
}
