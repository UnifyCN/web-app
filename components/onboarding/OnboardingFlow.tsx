"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn, RTL_FLIP } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { useSaveOnboarding } from "@/hooks/useOnboarding";
import {
  trackOnboardingCompleted,
  trackOnboardingStepCompleted,
} from "@/lib/analytics";
import { StepProgress } from "./StepProgress";
import { NameStep } from "./steps/NameStep";
import { PersonaStep } from "./steps/PersonaStep";
import { ReferralStep } from "./steps/ReferralStep";
import { ArrivalDateStep } from "./steps/ArrivalDateStep";
import { LocationStep } from "./steps/LocationStep";
import { GoalsStep } from "./steps/GoalsStep";
import { InterestsStep } from "./steps/InterestsStep";
import { HobbiesStep } from "./steps/HobbiesStep";
import { RemindersStep } from "./steps/RemindersStep";
import { OutcomeStep } from "./steps/OutcomeStep";
import { ConfirmationStep } from "./steps/ConfirmationStep";
import {
  EMPTY_DRAFT,
  draftToInput,
  type OnboardingDraft,
  type OnboardingStepProps,
} from "./types";

interface StepDef {
  key: string;
  Component: React.ComponentType<OnboardingStepProps>;
  /** Whether the user may advance past this step. */
  canAdvance: (draft: OnboardingDraft) => boolean;
}

const ALWAYS = () => true;

// Mirrors the 11-step mobile flow. Both onboard and edit run the full set
// (mobile's edit variant keeps step 1); only Persona blocks advancing.
const ALL_STEPS: StepDef[] = [
  { key: "name", Component: NameStep, canAdvance: ALWAYS },
  {
    key: "persona",
    Component: PersonaStep,
    canAdvance: (d) => d.persona !== null,
  },
  { key: "referral", Component: ReferralStep, canAdvance: ALWAYS },
  { key: "arrival", Component: ArrivalDateStep, canAdvance: ALWAYS },
  { key: "location", Component: LocationStep, canAdvance: ALWAYS },
  { key: "goals", Component: GoalsStep, canAdvance: ALWAYS },
  { key: "interests", Component: InterestsStep, canAdvance: ALWAYS },
  { key: "hobbies", Component: HobbiesStep, canAdvance: ALWAYS },
  { key: "reminders", Component: RemindersStep, canAdvance: ALWAYS },
  { key: "outcome", Component: OutcomeStep, canAdvance: ALWAYS },
  { key: "confirmation", Component: ConfirmationStep, canAdvance: ALWAYS },
];

interface OnboardingFlowProps {
  mode: "onboard" | "edit";
  initialDraft?: OnboardingDraft;
  /** Called after a successful save (navigate home / close the modal). */
  onComplete: () => void;
  /** Edit mode: shown as a Cancel action on the first step. */
  onCancel?: () => void;
}

/**
 * The reusable onboarding wizard core — owns step + draft state, validation,
 * navigation, and the single save mutation. Chrome (full-screen card vs modal)
 * is supplied by the caller.
 */
export function OnboardingFlow({
  mode,
  initialDraft,
  onComplete,
  onCancel,
}: OnboardingFlowProps) {
  const steps = ALL_STEPS;
  const { t } = useTranslation();

  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState<OnboardingDraft>(
    initialDraft ?? EMPTY_DRAFT,
  );
  const [error, setError] = useState<string | null>(null);
  const save = useSaveOnboarding();

  const step = steps[index];
  const Current = step.Component;
  const isFirst = index === 0;
  const isLast = index === steps.length - 1;
  const canAdvance = step.canAdvance(draft);

  const update = (patch: Partial<OnboardingDraft>) =>
    setDraft((d) => ({ ...d, ...patch }));

  const goNext = () => {
    if (canAdvance && !isLast) {
      // Onboarding drop-off funnel: one event per completed step. Skip edit mode
      // (re-editing a profile is not the onboarding funnel).
      if (mode === "onboard") {
        trackOnboardingStepCompleted({
          stepName: step.key,
          stepNumber: index + 1,
        });
      }
      setIndex((i) => i + 1);
    }
  };
  const goBack = () => setIndex((i) => Math.max(i - 1, 0));

  const finish = () => {
    if (!draft.persona) {
      setError(t("onboardingWeb.choosePersonaError"));
      return;
    }
    setError(null);
    save.mutate(draftToInput(draft), {
      onSuccess: () => {
        if (mode === "onboard") trackOnboardingCompleted();
        onComplete();
      },
      onError: (e) => {
        // PostgREST errors stringify to `{}` in some consoles — log the fields.
        const err = e as {
          message?: string;
          code?: string;
          details?: string;
          hint?: string;
        };
        console.error("saveOnboarding failed", {
          message: err?.message,
          code: err?.code,
          details: err?.details,
          hint: err?.hint,
        });
        setError(t("onboardingWeb.saveError"));
      },
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <StepProgress current={index} total={steps.length} />

      <div className="mt-4 -mx-2 -mb-2 min-h-0 flex-1 overflow-y-auto p-2">
        <Current draft={draft} update={update} mode={mode} />
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="mt-6 flex items-center justify-between gap-3">
        {isFirst ? (
          mode === "edit" && onCancel ? (
            <Button
              variant="ghost"
              onClick={onCancel}
              disabled={save.isPending}
            >
              {t("common.cancel")}
            </Button>
          ) : (
            <span />
          )
        ) : (
          <Button
            variant="ghost"
            leftIcon={<ChevronLeft className={cn("h-4 w-4", RTL_FLIP)} />}
            onClick={goBack}
            disabled={save.isPending}
          >
            {t("common.back")}
          </Button>
        )}

        {isLast ? (
          <Button onClick={finish} loading={save.isPending}>
            {mode === "edit"
              ? t("onboardingWeb.saveChanges")
              : t("onboardingWeb.finish")}
          </Button>
        ) : (
          <Button
            onClick={goNext}
            disabled={!canAdvance}
            rightIcon={<ChevronRight className={cn("h-4 w-4", RTL_FLIP)} />}
          >
            {t("common.continue")}
          </Button>
        )}
      </div>
    </div>
  );
}
