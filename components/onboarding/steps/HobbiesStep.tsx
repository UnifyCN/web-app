import {
  Cpu,
  DollarSign,
  Dumbbell,
  Film,
  GraduationCap,
  Map,
  Music,
  Sparkles,
  TrendingUp,
  Users,
  Utensils,
} from "lucide-react";
import { HOBBY_OPTIONS } from "@/lib/onboarding/constants";
import { CARD_COLORS, SelectableCard } from "../SelectableCard";
import { StepHeading } from "../StepHeading";
import type { OnboardingStepProps } from "../types";

const HOBBY_ICON: Record<string, React.ReactNode> = {
  career_growth: <TrendingUp className="h-5 w-5" />,
  exploring_canada: <Map className="h-5 w-5" />,
  wellness: <Sparkles className="h-5 w-5" />,
  technology: <Cpu className="h-5 w-5" />,
  music: <Music className="h-5 w-5" />,
  fitness: <Dumbbell className="h-5 w-5" />,
  personal_finance: <DollarSign className="h-5 w-5" />,
  family_parenting: <Users className="h-5 w-5" />,
  education: <GraduationCap className="h-5 w-5" />,
  food_cooking: <Utensils className="h-5 w-5" />,
  movies: <Film className="h-5 w-5" />,
};

export function HobbiesStep({ draft, update }: OnboardingStepProps) {
  const toggle = (value: string) => {
    const next = draft.hobbies.includes(value)
      ? draft.hobbies.filter((h) => h !== value)
      : [...draft.hobbies, value];
    update({ hobbies: next });
  };

  return (
    <div>
      <StepHeading
        title="What are your hobbies?"
        subtitle="Pick any that apply — we'll use them to suggest people and groups."
      />
      <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {HOBBY_OPTIONS.map((opt, i) => (
          <SelectableCard
            key={opt.value}
            selected={draft.hobbies.includes(opt.value)}
            onToggle={() => toggle(opt.value)}
            label={opt.label}
            icon={HOBBY_ICON[opt.value]}
            color={CARD_COLORS[i % CARD_COLORS.length]}
          />
        ))}
      </div>
    </div>
  );
}
