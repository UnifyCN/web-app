import { useTranslation } from "react-i18next";
import { StepHeading } from "../StepHeading";
import { ArrivalMonthFields } from "../ArrivalMonthFields";
import type { OnboardingStepProps } from "../types";

/** Arrival month (past or future, required as on mobile). */
export function ArrivalDateStep({ draft, update }: OnboardingStepProps) {
  const { t } = useTranslation();
  return (
    <div>
      <StepHeading
        title={t("quiz.q.arrivalDate")}
        subtitle={t("onboardingWeb.arrival.subtitle")}
      />
      <div className="mt-5">
        <ArrivalMonthFields
          month={draft.arrivalMonth}
          year={draft.arrivalYear}
          onChange={({ month, year }) =>
            update({ arrivalMonth: month, arrivalYear: year })
          }
        />
      </div>
    </div>
  );
}
