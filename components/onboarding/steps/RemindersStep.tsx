import { Bell, BellOff } from "lucide-react";
import { SelectableCard } from "../SelectableCard";
import { StepHeading } from "../StepHeading";
import type { OnboardingStepProps } from "../types";

/**
 * Learning-reminder opt-in (boolean). Social notifications (likes, comments,
 * follows) are unaffected — this only gates the lesson nudges, matching mobile.
 */
export function RemindersStep({ draft, update }: OnboardingStepProps) {
  return (
    <div>
      <StepHeading
        title="Want gentle reminders so you don't miss important steps?"
        subtitle="You'll always get notified about likes, comments, and follows. This controls learning reminders — nudges about lessons you started but haven't finished."
      />
      <div className="mt-5 space-y-2.5">
        <SelectableCard
          selected={draft.learningReminders === true}
          onToggle={() => update({ learningReminders: true })}
          label="Yes, send reminders"
          icon={<Bell className="h-5 w-5" />}
        />
        <SelectableCard
          selected={draft.learningReminders === false}
          onToggle={() => update({ learningReminders: false })}
          label="No thanks"
          icon={<BellOff className="h-5 w-5" />}
        />
      </div>
    </div>
  );
}
