import {
  Baby,
  Briefcase,
  Bus,
  CreditCard,
  FileText,
  Globe,
  Heart,
  Home,
  MoreHorizontal,
} from "lucide-react";
import { INTEREST_OPTIONS } from "@/lib/onboarding/constants";
import { SelectableCard } from "../SelectableCard";
import { StepHeading } from "../StepHeading";
import type { OnboardingStepProps } from "../types";

const INTEREST_ICON: Record<string, React.ReactNode> = {
  documents: <FileText className="h-5 w-5" />,
  employment: <Briefcase className="h-5 w-5" />,
  finance: <CreditCard className="h-5 w-5" />,
  housing: <Home className="h-5 w-5" />,
  pr_immigration: <Globe className="h-5 w-5" />,
  healthcare: <Heart className="h-5 w-5" />,
  family_kids: <Baby className="h-5 w-5" />,
  transit: <Bus className="h-5 w-5" />,
  other: <MoreHorizontal className="h-5 w-5" />,
};

export function InterestsStep({ draft, update }: OnboardingStepProps) {
  const toggle = (value: string) => {
    const next = draft.learningInterests.includes(value)
      ? draft.learningInterests.filter((i) => i !== value)
      : [...draft.learningInterests, value];
    update({ learningInterests: next });
  };

  return (
    <div>
      <StepHeading
        title="What would you like help with?"
        subtitle="Choose the topics you want to learn about."
      />
      <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {INTEREST_OPTIONS.map((opt) => (
          <SelectableCard
            key={opt.value}
            selected={draft.learningInterests.includes(opt.value)}
            onToggle={() => toggle(opt.value)}
            label={opt.label}
            icon={INTEREST_ICON[opt.value]}
          />
        ))}
      </div>
    </div>
  );
}
