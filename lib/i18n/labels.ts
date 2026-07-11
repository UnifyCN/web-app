"use client";

import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { PERSONA_LABEL, STAGE_LABEL } from "@/lib/onboarding/constants";
import type { Persona, Priority, Stage } from "@/types";

/* ------------------------------------------------------------------ *
 * Translated display labels for the persona / stage enums.
 *
 * The slugs (and the English label maps in lib/onboarding/constants.ts)
 * are stored data / shared identity — never change them. These hooks map
 * slug → t() key for display only, reusing the mobile checklist.* keys
 * whose English copy matches the web labels exactly, and profile.* keys
 * for the ones that differ.
 * ------------------------------------------------------------------ */

const PERSONA_KEY: Record<Persona, string> = {
  international_student: "checklist.persona.international_student",
  skilled_worker: "checklist.persona.skilled_worker",
  refugee: "checklist.persona.refugee",
  other: "profile.persona.other",
};

/** Translated persona badge label (English copy matches PERSONA_LABEL). */
export function usePersonaLabel(): (persona: Persona) => string {
  const { t } = useTranslation();
  return useCallback(
    (persona: Persona) =>
      t(PERSONA_KEY[persona], { defaultValue: PERSONA_LABEL[persona] }),
    [t],
  );
}

const STAGE_KEY: Record<Stage, string> = {
  0: "checklist.stage.0",
  1: "profile.stage.1",
  2: "profile.stage.2",
  3: "profile.stage.3",
  4: "profile.stage.4",
};

/**
 * Checklist priority display keys. The Priority enum values are stored data
 * identity (Supabase rows) — never translate or change the values themselves;
 * only the rendered label goes through these keys.
 */
export const PRIORITY_LABEL_KEY: Record<Priority, string> = {
  "Do now": "checklist.createItem.priorityDoNow",
  "Do soon": "checklist.createItem.priorityDoSoon",
  "Explore and connect": "checklist.createItem.priorityExploreConnect",
  "Optional / later": "checklist.createItem.priorityOptionalLater",
};

/** Translated time-in-Canada stage label (English copy matches STAGE_LABEL). */
export function useStageLabel(): (stage: Stage) => string {
  const { t } = useTranslation();
  return useCallback(
    (stage: Stage) => t(STAGE_KEY[stage], { defaultValue: STAGE_LABEL[stage] }),
    [t],
  );
}
