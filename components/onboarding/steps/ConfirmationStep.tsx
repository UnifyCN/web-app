import { useTranslation } from "react-i18next";
import { UnifyLogo } from "@/components/UnifyLogo";
import type { OnboardingStepProps } from "../types";

/**
 * Final step — branded confirmation (mirrors mobile step 11). The flow's footer
 * button ("Finish" / "Save changes") performs the save; this screen is the
 * celebratory close. Copy varies by mode.
 */
export function ConfirmationStep({ mode }: OnboardingStepProps) {
  const { t } = useTranslation();
  const isEdit = mode === "edit";
  return (
    <div className="flex flex-col items-center py-6 text-center">
      <UnifyLogo variant="mark" size={56} />
      <h1 className="mt-6 text-xl font-semibold text-ink-secondary">
        {t(
          isEdit
            ? "onboardingWeb.confirmation.titleEdit"
            : "onboardingWeb.confirmation.titleOnboard",
        )}
      </h1>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-muted">
        {t(
          isEdit
            ? "onboardingWeb.confirmation.bodyEdit"
            : "onboardingWeb.confirmation.bodyOnboard",
        )}
      </p>
    </div>
  );
}
