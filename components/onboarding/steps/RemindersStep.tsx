import { Bell, BellOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SelectableCard } from "../SelectableCard";
import { StepHeading } from "../StepHeading";
import type { OnboardingStepProps } from "../types";

/**
 * Learning-reminder opt-in (boolean). Social notifications (likes, comments,
 * follows) are unaffected — this only gates the lesson nudges, matching mobile.
 */
export function RemindersStep({ draft, update }: OnboardingStepProps) {
  const { t } = useTranslation();
  return (
    <div>
      <StepHeading
        title={t("onboardingWeb.reminders.title")}
        subtitle={t("onboardingWeb.reminders.subtitle")}
      />
      <div className="mt-5 space-y-2.5">
        <SelectableCard
          selected={draft.learningReminders === true}
          onToggle={() => update({ learningReminders: true })}
          label={t("onboardingWeb.reminders.yes")}
          icon={<Bell className="h-5 w-5" />}
        />
        <SelectableCard
          selected={draft.learningReminders === false}
          onToggle={() => update({ learningReminders: false })}
          label={t("onboardingWeb.reminders.no")}
          icon={<BellOff className="h-5 w-5" />}
        />
      </div>
    </div>
  );
}
