import { Briefcase, GraduationCap, ShieldCheck, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Persona } from "@/types";
import { PERSONA_OPTIONS } from "@/lib/onboarding/constants";
import { SelectableCard } from "../SelectableCard";
import { StepHeading } from "../StepHeading";
import type { OnboardingStepProps } from "../types";

const PERSONA_ICON: Record<Persona, React.ReactNode> = {
  international_student: <GraduationCap className="h-5 w-5" />,
  skilled_worker: <Briefcase className="h-5 w-5" />,
  refugee: <ShieldCheck className="h-5 w-5" />,
  other: <UserRound className="h-5 w-5" />,
};

export function PersonaStep({ draft, update }: OnboardingStepProps) {
  const { t } = useTranslation();
  return (
    <div>
      <StepHeading
        title={t("onboardingWeb.persona.title")}
        subtitle={t("onboardingWeb.persona.subtitle")}
      />
      <div className="mt-5 space-y-2.5">
        {PERSONA_OPTIONS.map((opt) => (
          <SelectableCard
            key={opt.value}
            selected={draft.persona === opt.value}
            onToggle={() => update({ persona: opt.value })}
            label={t(`onboardingWeb.persona.options.${opt.value}.label`)}
            description={t(`onboardingWeb.persona.options.${opt.value}.description`)}
            icon={PERSONA_ICON[opt.value]}
          />
        ))}
      </div>
    </div>
  );
}
