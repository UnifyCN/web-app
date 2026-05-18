import type { LearningProgressSummary } from "@/types";

// TODO: replace with real data — mock learning progress for the Home widget.
export const learningProgress: LearningProgressSummary[] = [
  {
    id: "lp1",
    moduleName: "Banking & Credit in Canada",
    progressPercent: 20,
    bannerUrl: "https://picsum.photos/seed/learn-banking/640/280",
  },
  {
    id: "lp2",
    moduleName: "Finding Your First Home",
    progressPercent: 60,
    bannerUrl: "https://picsum.photos/seed/learn-housing/640/280",
  },
  {
    id: "lp3",
    moduleName: "Healthcare Essentials",
    progressPercent: 100,
    bannerUrl: "https://picsum.photos/seed/learn-health/640/280",
  },
];
