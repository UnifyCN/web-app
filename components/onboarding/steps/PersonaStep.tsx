import { Briefcase, GraduationCap, ShieldCheck, UserRound } from "lucide-react";
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
  return (
    <div>
      <StepHeading
        title="Which best describes you?"
        subtitle="This shapes your checklist and the tips you see."
      />
      <div className="mt-5 space-y-2.5">
        {PERSONA_OPTIONS.map((opt) => (
          <SelectableCard
            key={opt.value}
            selected={draft.persona === opt.value}
            onToggle={() => update({ persona: opt.value })}
            label={opt.label}
            description={opt.description}
            icon={PERSONA_ICON[opt.value]}
          />
        ))}
      </div>
    </div>
  );
}
