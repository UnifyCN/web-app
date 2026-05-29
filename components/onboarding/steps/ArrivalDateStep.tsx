import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { StepHeading } from "../StepHeading";
import type { OnboardingStepProps } from "../types";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const SELECT_CLASS =
  "h-11 w-full rounded-lg border border-border-card bg-surface px-3 text-sm text-ink-muted " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50";

export function ArrivalDateStep({ draft, update }: OnboardingStepProps) {
  const thisYear = new Date().getFullYear();
  // Next year (planning ahead) down to 40 years back.
  const years = [...Array(42).keys()].map((i) => thisYear + 1 - i);

  return (
    <div>
      <StepHeading
        title="When did you arrive in Canada?"
        subtitle="An approximate month is fine — it sets your settling-in stage."
      />

      <div className="mt-5 grid grid-cols-2 gap-3">
        <select
          aria-label="Arrival month"
          className={SELECT_CLASS}
          value={draft.arrivalMonth ?? ""}
          disabled={draft.notArrived}
          onChange={(e) =>
            update({
              arrivalMonth: e.target.value ? Number(e.target.value) : null,
            })
          }
        >
          <option value="">Month</option>
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>

        <select
          aria-label="Arrival year"
          className={SELECT_CLASS}
          value={draft.arrivalYear ?? ""}
          disabled={draft.notArrived}
          onChange={(e) =>
            update({
              arrivalYear: e.target.value ? Number(e.target.value) : null,
            })
          }
        >
          <option value="">Year</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
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
        I haven&apos;t arrived in Canada yet
      </button>
    </div>
  );
}
