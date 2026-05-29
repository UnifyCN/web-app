import {
  GOAL_LABEL,
  INTEREST_LABEL,
  PERSONA_LABEL,
  PROVINCE_NAME,
  STAGE_LABEL,
  type Goal,
  type LearningInterest,
  type ProvinceCode,
} from "@/lib/onboarding/constants";
import { calculateUserStage } from "@/lib/onboarding/calculateUserStage";
import { StepHeading } from "../StepHeading";
import { toArrivalDate, type OnboardingStepProps } from "../types";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <dt className="shrink-0 text-xs font-medium text-ink-placeholder">
        {label}
      </dt>
      <dd className="text-right text-sm text-ink-secondary">{value}</dd>
    </div>
  );
}

export function ReviewStep({ draft }: OnboardingStepProps) {
  const stage = calculateUserStage(toArrivalDate(draft));

  const personaLabel = draft.persona ? PERSONA_LABEL[draft.persona] : "—";

  const provinceName = draft.province
    ? (PROVINCE_NAME[draft.province as ProvinceCode] ?? draft.province)
    : "";
  const location =
    [draft.city.trim(), provinceName].filter(Boolean).join(", ") || "Not set";

  const goals = draft.goals.length
    ? draft.goals.map((g) => GOAL_LABEL[g as Goal] ?? g).join(", ")
    : "None selected";

  const interests = draft.learningInterests.length
    ? draft.learningInterests
        .map((i) => INTEREST_LABEL[i as LearningInterest] ?? i)
        .join(", ")
    : "None selected";

  return (
    <div>
      <StepHeading
        title="Does this look right?"
        subtitle="You can change any of this later from your profile."
      />
      <dl className="mt-5 divide-y divide-border-card overflow-hidden rounded-card border border-border-card bg-surface-card">
        <Row label="I am a" value={personaLabel} />
        <Row label="Time in Canada" value={STAGE_LABEL[stage]} />
        <Row label="Location" value={location} />
        <Row label="Goals" value={goals} />
        <Row label="Interests" value={interests} />
      </dl>
    </div>
  );
}
