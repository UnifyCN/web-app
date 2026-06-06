import { BookOpen, MoreHorizontal, Users, Zap } from "lucide-react";
import { GOAL_OPTIONS } from "@/lib/onboarding/constants";
import { CARD_COLORS, SelectableCard } from "../SelectableCard";
import { StepHeading } from "../StepHeading";
import type { OnboardingStepProps } from "../types";

const GOAL_ICON: Record<string, React.ReactNode> = {
  learn_something: <BookOpen className="h-5 w-5" />,
  build_community: <Users className="h-5 w-5" />,
  quick_answers: <Zap className="h-5 w-5" />,
  something_else: <MoreHorizontal className="h-5 w-5" />,
};

export function GoalsStep({ draft, update }: OnboardingStepProps) {
  const toggle = (value: string) => {
    const next = draft.goals.includes(value)
      ? draft.goals.filter((g) => g !== value)
      : [...draft.goals, value];
    update({ goals: next });
  };

  return (
    <div>
      <StepHeading
        title="What brings you to Unify?"
        subtitle="Pick any that apply — you can change these anytime."
      />
      <div className="mt-5 space-y-2.5">
        {GOAL_OPTIONS.map((opt, i) => (
          <SelectableCard
            key={opt.value}
            selected={draft.goals.includes(opt.value)}
            onToggle={() => toggle(opt.value)}
            label={opt.label}
            icon={GOAL_ICON[opt.value]}
            color={CARD_COLORS[i % CARD_COLORS.length]}
          />
        ))}
      </div>
    </div>
  );
}
