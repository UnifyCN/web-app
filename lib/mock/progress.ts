import type { LearningProgressSummary } from "@/types";

/**
 * Home right-panel mock fallback. Used by services/learn.ts when Supabase
 * isn't configured. Real source: learn_progress joined with Sanity module
 * metadata via getLearningProgressSummary().
 */

export const mockLearningProgress: LearningProgressSummary[] = [
  {
    moduleId: "mock-mod-docs",
    moduleName: "Documentation & Identification",
    progressPercent: 50,
    colorHex: "#5182C7",
  },
];
