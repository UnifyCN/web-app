import { Check, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { StepHeading } from "../StepHeading";
import type { OnboardingStepProps } from "../types";

const SELECT_CLASS =
  "h-11 w-full appearance-none rounded-lg border border-border-card bg-surface px-3 pr-10 text-sm text-ink-muted " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50";

const CHEVRON_CLASS =
  "pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-placeholder";

export function ArrivalDateStep({ draft, update }: OnboardingStepProps) {
  const { t, i18n } = useTranslation();
  const thisYear = new Date().getFullYear();
  // Next year (planning ahead) down to 40 years back.
  const years = [...Array(42).keys()].map((i) => thisYear + 1 - i);
  // Month names localized to the active language (no translation keys needed).
  const monthFmt = new Intl.DateTimeFormat(i18n.language, { month: "long" });
  const months = [...Array(12).keys()].map((i) =>
    monthFmt.format(new Date(2021, i, 1)),
  );

  return (
    <div>
      <StepHeading
        title={t("onboardingWeb.arrival.title")}
        subtitle={t("onboardingWeb.arrival.subtitle")}
      />

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="relative">
          <select
            aria-label={t("onboardingWeb.arrival.ariaMonth")}
            className={SELECT_CLASS}
            value={draft.arrivalMonth ?? ""}
            disabled={draft.notArrived}
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
            disabled={draft.notArrived}
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

      <button
        type="button"
        aria-pressed={draft.notArrived}
        onClick={() =>
          update({
            notArrived: !draft.notArrived,
            arrivalMonth: null,
            arrivalYear: null,
          })
        }
        className={cn(
          "mt-4 flex w-full items-center gap-2.5 rounded-lg border p-3 text-left text-sm",
          "cursor-pointer transition-colors duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
          draft.notArrived
            ? "border-primary bg-primary-bg font-medium text-primary"
            : "border-border-card text-ink-muted hover:bg-surface-gray",
        )}
      >
        <span
          className={cn(
            "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
            draft.notArrived
              ? "border-primary bg-primary text-white"
              : "border-border-card text-transparent",
          )}
          aria-hidden
        >
          <Check className="h-3 w-3" />
        </span>
        {t("onboardingWeb.arrival.notArrived")}
      </button>
    </div>
  );
}
