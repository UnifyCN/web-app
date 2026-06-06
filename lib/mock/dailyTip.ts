import type { DailyTip } from "@/types";

/**
 * Local-dev / env-not-configured fallback for the daily tip. Realistic Canadian
 * newcomer content (no lorem ipsum), matching the shape returned by the
 * `get-daily-tip` edge function.
 */
export const mockDailyTip: DailyTip = {
  id: "mock-daily-tip",
  category: "finance",
  title: "Open a newcomer chequing account",
  description: "Most big banks waive monthly fees for your first year.",
  tipText:
    "Bring your PR card or study permit plus one piece of photo ID to a major bank (RBC, TD, Scotiabank) — newcomer packages typically waive fees for 12 months and often include a no-fee international transfer.",
  date: new Date().toISOString().split("T")[0],
  sources: null,
};
