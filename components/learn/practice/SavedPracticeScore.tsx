"use client";

import { useMemo } from "react";
import { usePractices } from "@/hooks/useLearn";
import type { PracticeProgress } from "@/types";
import { flattenPractices } from "./flattenPractices";
import { displayKnowledgeScore } from "./savedScore";

interface SavedPracticeScoreProps {
  submoduleId: string;
  progress: PracticeProgress;
  /** Shown while the section's content loads, and whenever no score is safe. */
  fallback: string;
}

/**
 * Knowledge score text for a section's saved practice, e.g. `2/2`. Needs the
 * section's current questions to tell knowledge from reflection, so it reads
 * them through `usePractices` (cached per section and language). Until they
 * load, or when the saved answers cannot support a score, it shows `fallback`.
 */
export function SavedPracticeScore({
  submoduleId,
  progress,
  fallback,
}: SavedPracticeScoreProps) {
  const practices = usePractices(submoduleId).data;
  const score = useMemo(
    () =>
      practices
        ? displayKnowledgeScore(
            flattenPractices(practices).map(({ question }) => question),
            progress,
          )
        : null,
    [practices, progress],
  );
  return <>{score ? `${score.correct}/${score.total}` : fallback}</>;
}
