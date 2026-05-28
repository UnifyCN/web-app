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
  {
    moduleId: "mock-mod-banking",
    moduleName: "Banking & Credit in Canada",
    progressPercent: 25,
    colorHex: "#f68b26",
  },
  {
    moduleId: "mock-mod-housing",
    moduleName: "Finding Your First Home",
    progressPercent: 75,
    colorHex: "#f68b26",
  },
];
