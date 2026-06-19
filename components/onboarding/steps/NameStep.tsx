import { StepHeading } from "../StepHeading";
import type { OnboardingStepProps } from "../types";

const FIELD_CLASS =
  "mt-5 h-11 w-full rounded-lg border border-border-card bg-surface px-3 text-base text-ink-muted " +
  "placeholder:text-ink-placeholder focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

/**
 * First step — first name plus the welcome/update framing. Mirrors mobile step 1
 * ("Update Your Profile"), which doubles as the intro. Copy varies by mode; the
 * field is optional so it never blocks the flow.
 */
export function NameStep({ draft, update, mode }: OnboardingStepProps) {
  const isEdit = mode === "edit";
  return (
    <div>
      <StepHeading
        title={isEdit ? "Update your profile" : "Let's set up Unify for you"}
        subtitle={
          isEdit
            ? "Things change — update your answers so your checklist and Companion stay relevant."
            : "A few quick questions tailor your checklist, learning, and community to your journey. It takes about a minute."
        }
      />
      <input
        type="text"
        aria-label="First name"
        placeholder="Your first name"
        value={draft.firstName}
        onChange={(e) => update({ firstName: e.target.value })}
        className={FIELD_CLASS}
        autoComplete="given-name"
      />
    </div>
  );
}
