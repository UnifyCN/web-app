import { Compass, Users, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";
import { StepHeading } from "../StepHeading";

const OUTCOMES = [
  { Icon: Compass, key: "item1" },
  { Icon: Zap, key: "item2" },
  { Icon: Users, key: "item3" },
] as const;

/** Static value preview — mirrors mobile step 10. Collects no data. */
export function OutcomeStep() {
  const { t } = useTranslation();
  return (
    <div>
      <StepHeading
        title={t("onboardingWeb.outcome.title")}
        subtitle={t("onboardingWeb.outcome.subtitle")}
      />
      <div className="mt-5 space-y-3">
        {OUTCOMES.map(({ Icon, key }) => (
          <div
            key={key}
            className="flex items-start gap-3 rounded-card border border-border-card bg-surface-card p-4 shadow-sm"
          >
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-bg text-primary"
              aria-hidden
            >
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink-secondary">
                {t(`onboardingWeb.outcome.${key}Title`)}
              </p>
              <p className="mt-0.5 text-xs text-ink-muted">
                {t(`onboardingWeb.outcome.${key}Body`)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
