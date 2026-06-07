import {
  Compass,
  Landmark,
  HeartPulse,
  Plane,
  GraduationCap,
  Briefcase,
  Home,
  Bus,
  FileText,
  Baby,
  Users,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserOnboardingProfile } from "@/types";

type IconType = React.ComponentType<{ className?: string }>;

interface Candidate {
  topic: string;
  question: string;
  icon: IconType;
}

/** The original generic prompts — also the fallback when there's no profile. */
const DEFAULT_STARTERS: Candidate[] = [
  {
    topic: "Settlement",
    question: "What resources are available for newcomers settling in Canada?",
    icon: Compass,
  },
  {
    topic: "Finance",
    question: "How do I open a bank account and build credit in Canada?",
    icon: Landmark,
  },
  {
    topic: "Healthcare",
    question: "How do I apply for a provincial health card?",
    icon: HeartPulse,
  },
  {
    topic: "Immigration",
    question: "How does Express Entry work for permanent residence?",
    icon: Plane,
  },
];

/** Tile/accent palettes cycled by position so the grid stays visually balanced
 *  regardless of which chips get chosen. */
const PALETTES = [
  { tile: "bg-priority-optional-bg", accent: "text-priority-optional" },
  { tile: "bg-priority-do-soon-bg", accent: "text-priority-do-soon" },
  { tile: "bg-priority-do-now-bg", accent: "text-priority-do-now" },
  { tile: "bg-priority-explore-bg", accent: "text-priority-explore" },
];

const INTEREST_CHIPS: Record<string, Candidate> = {
  finance: {
    topic: "Banking",
    question: "How do I open a bank account and build credit in Canada?",
    icon: Landmark,
  },
  healthcare: {
    topic: "Healthcare",
    question: "How do I apply for a provincial health card?",
    icon: HeartPulse,
  },
  housing: {
    topic: "Housing",
    question: "How do I find and rent an apartment in Canada?",
    icon: Home,
  },
  employment: {
    topic: "Jobs",
    question: "How do I find a job and write a Canadian-style resume?",
    icon: Briefcase,
  },
  pr_immigration: {
    topic: "Immigration",
    question: "How does Express Entry work for permanent residence?",
    icon: Plane,
  },
  documents: {
    topic: "Documents",
    question: "How do I get a SIN and the IDs I need in Canada?",
    icon: FileText,
  },
  transit: {
    topic: "Transit",
    question: "How do I get around using public transit in my city?",
    icon: Bus,
  },
  family_kids: {
    topic: "Family",
    question: "How do I enrol my kids in school and find childcare?",
    icon: Baby,
  },
};

/** Build a prioritized candidate list from the user's onboarding profile.
 *  The component dedupes, fills from DEFAULT_STARTERS, and takes the first 4. */
function buildCandidates(onboarding: UserOnboardingProfile | null): Candidate[] {
  if (!onboarding) return DEFAULT_STARTERS;

  const { persona, stage, goals, learningInterests, city } = onboarding;
  const cityName = city?.trim();
  const out: Candidate[] = [];

  // Pre-arrival prep leads for users who haven't landed yet.
  if (stage === 0) {
    out.push({
      topic: "Before you arrive",
      question: "What should I prepare before moving to Canada?",
      icon: Plane,
    });
  }

  // Persona-led chip.
  if (persona === "international_student") {
    out.push({
      topic: "Study permit",
      question:
        "How do I maintain my study permit and work part-time as a student?",
      icon: GraduationCap,
    });
  } else if (persona === "skilled_worker") {
    out.push({
      topic: "Your career",
      question: "How do I get my foreign credentials recognized in Canada?",
      icon: Briefcase,
    });
  } else if (persona === "refugee") {
    out.push({
      topic: "Settlement",
      question: "What settlement support is available for refugees in Canada?",
      icon: Compass,
    });
  }

  // Interest-led chips, in the order the user picked them.
  for (const interest of learningInterests) {
    const chip = INTEREST_CHIPS[interest];
    if (chip) out.push(chip);
  }

  // Community chip when that's a stated goal.
  if (goals.includes("build_community")) {
    out.push({
      topic: "Community",
      question: cityName
        ? `How can I meet people and make friends in ${cityName}?`
        : "How can I meet people and build community as a newcomer?",
      icon: Users,
    });
  }

  // Local-services chip when we know the city.
  if (cityName) {
    out.push({
      topic: "Local services",
      question: `What newcomer services are available in ${cityName}?`,
      icon: Compass,
    });
  }

  return out;
}

/** Up to four tappable starter prompts for the Companion empty state —
 *  personalized from the onboarding profile, with a generic fallback. */
export function StarterPromptChips({
  onSelect,
  onboarding = null,
}: {
  onSelect: (question: string) => void;
  onboarding?: UserOnboardingProfile | null;
}) {
  const picked: Candidate[] = [];
  const seen = new Set<string>();
  for (const candidate of [...buildCandidates(onboarding), ...DEFAULT_STARTERS]) {
    if (picked.length >= 4) break;
    if (seen.has(candidate.topic)) continue;
    seen.add(candidate.topic);
    picked.push(candidate);
  }

  return (
    <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
      {picked.map((starter, index) => {
        const Icon = starter.icon;
        const palette = PALETTES[index % PALETTES.length];
        return (
          <button
            key={starter.topic}
            type="button"
            onClick={() => onSelect(starter.question)}
            className="flex cursor-pointer items-start gap-3 rounded-card border border-border-card bg-surface p-3 text-left transition-shadow duration-150 hover:shadow-md"
          >
            <span
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                palette.tile,
              )}
            >
              <Icon className={cn("h-5 w-5", palette.accent)} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between">
                <span className="text-sm font-semibold text-ink-secondary">
                  {starter.topic}
                </span>
                <ChevronRight
                  className="h-4 w-4 text-ink-placeholder"
                  aria-hidden
                />
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">
                {starter.question}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
