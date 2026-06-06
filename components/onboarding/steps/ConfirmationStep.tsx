import { UnifyLogo } from "@/components/UnifyLogo";
import type { OnboardingStepProps } from "../types";

/**
 * Final step — branded confirmation (mirrors mobile step 11). The flow's footer
 * button ("Finish" / "Save changes") performs the save; this screen is the
 * celebratory close. Copy varies by mode.
 */
export function ConfirmationStep({ mode }: OnboardingStepProps) {
  const isEdit = mode === "edit";
  return (
    <div className="flex flex-col items-center py-6 text-center">
      <UnifyLogo variant="mark" size={56} />
      <h1 className="mt-6 text-xl font-semibold text-ink-secondary">
        {isEdit ? "Profile updated" : "You're all set"}
      </h1>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-muted">
        {isEdit
          ? "Your preferences have been updated. Your Checklist and Companion responses will now reflect your latest answers."
          : "Your Checklist, Learning, and Companion are now tailored to you. Press Finish to jump in."}
      </p>
    </div>
  );
}
