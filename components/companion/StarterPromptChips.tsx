"use client";

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
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { UserOnboardingProfile } from "@/types";

type IconType = React.ComponentType<{ className?: string }>;

/** Entries carry i18n key names; the component translates at render time. */
interface Candidate {
  topicKey: string;
  questionKey: string;
  icon: IconType;
}

/** The original generic prompts — also the fallback when there's no profile. */
const DEFAULT_STARTERS: Candidate[] = [
  {
    topicKey: "companion.webStarters.settlementTopic",
    questionKey: "companion.webStarters.settlementQ",
    icon: Compass,
  },
  {
    topicKey: "companion.webStarters.financeTopic",
    questionKey: "companion.webStarters.bankingQ",
    icon: Landmark,
  },
  {
    topicKey: "companion.webStarters.healthcareTopic",
    questionKey: "companion.webStarters.healthcareQ",
    icon: HeartPulse,
  },
  {
    topicKey: "companion.webStarters.immigrationTopic",
    questionKey: "companion.webStarters.immigrationQ",
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
    topicKey: "companion.webStarters.bankingTopic",
    questionKey: "companion.webStarters.bankingQ",
    icon: Landmark,
  },
  healthcare: {
    topicKey: "companion.webStarters.healthcareTopic",
    questionKey: "companion.webStarters.healthcareQ",
    icon: HeartPulse,
  },
  housing: {
    topicKey: "companion.webStarters.housingTopic",
    questionKey: "companion.webStarters.housingQ",
    icon: Home,
  },
  employment: {
    topicKey: "companion.webStarters.jobsTopic",
    questionKey: "companion.webStarters.jobsQ",
    icon: Briefcase,
  },
  pr_immigration: {
    topicKey: "companion.webStarters.immigrationTopic",
    questionKey: "companion.webStarters.immigrationQ",
    icon: Plane,
  },
  documents: {
    topicKey: "companion.webStarters.documentsTopic",
    questionKey: "companion.webStarters.documentsQ",
    icon: FileText,
  },
  transit: {
    topicKey: "companion.webStarters.transitTopic",
    questionKey: "companion.webStarters.transitQ",
    icon: Bus,
  },
  family_kids: {
    topicKey: "companion.webStarters.familyTopic",
    questionKey: "companion.webStarters.familyQ",
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
      topicKey: "companion.webStarters.beforeArrivalTopic",
      questionKey: "companion.webStarters.beforeArrivalQ",
      icon: Plane,
    });
  }

  // Persona-led chip.
  if (persona === "international_student") {
    out.push({
      topicKey: "companion.webStarters.studyPermitTopic",
      questionKey: "companion.webStarters.studyPermitQ",
      icon: GraduationCap,
    });
  } else if (persona === "skilled_worker") {
    out.push({
      topicKey: "companion.webStarters.careerTopic",
      questionKey: "companion.webStarters.careerQ",
      icon: Briefcase,
    });
  } else if (persona === "refugee") {
    out.push({
      topicKey: "companion.webStarters.settlementTopic",
      questionKey: "companion.webStarters.refugeeSettlementQ",
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
      topicKey: "companion.webStarters.communityTopic",
      questionKey: cityName
        ? "companion.webStarters.communityCityQ"
        : "companion.webStarters.communityQ",
      icon: Users,
    });
  }

  // Local-services chip when we know the city.
  if (cityName) {
    out.push({
      topicKey: "companion.webStarters.localServicesTopic",
      questionKey: "companion.webStarters.localServicesQ",
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
  const { t } = useTranslation();
  const city = onboarding?.city?.trim();
  const candidates = buildCandidates(onboarding);
  const picked: Candidate[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (picked.length >= 4) break;
    if (seen.has(candidate.topicKey)) continue;
    seen.add(candidate.topicKey);
    picked.push(candidate);
  }
  // Pad from the generic defaults only when a personalized (non-null) profile
  // produced fewer than four chips. When onboarding is null, buildCandidates
  // already returned DEFAULT_STARTERS, so there's nothing to add.
  if (onboarding && picked.length < 4) {
    for (const candidate of DEFAULT_STARTERS) {
      if (picked.length >= 4) break;
      if (seen.has(candidate.topicKey)) continue;
      seen.add(candidate.topicKey);
      picked.push(candidate);
    }
  }

  return (
    <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
      {picked.map((starter, index) => {
        const Icon = starter.icon;
        const palette = PALETTES[index % PALETTES.length];
        const question = t(starter.questionKey, { city });
        return (
          <button
            key={starter.topicKey}
            type="button"
            onClick={() => onSelect(question)}
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
                  {t(starter.topicKey)}
                </span>
                <ChevronRight
                  className="h-4 w-4 text-ink-placeholder"
                  aria-hidden
                />
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">
                {question}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
