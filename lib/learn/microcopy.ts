/**
 * Encouraging microcopy for the Learn section — small contextual nudges keyed
 * to progress. Each selector returns an i18n key (learnWeb.microcopy.*) so the
 * threshold logic stays pure; callers render with t(key).
 */

/** Module-card line based on completion percent (0–100). */
export function moduleProgressKey(percent: number): string {
  const safe = Number.isFinite(percent) ? percent : 0;
  const p = Math.max(0, Math.min(100, Math.round(safe)));
  if (p === 0) return "learnWeb.microcopy.progress.begin";
  if (p <= 25) return "learnWeb.microcopy.progress.goodStart";
  if (p <= 50) return "learnWeb.microcopy.progress.making";
  if (p <= 75) return "learnWeb.microcopy.progress.halfway";
  if (p <= 99) return "learnWeb.microcopy.progress.almost";
  return "learnWeb.microcopy.progress.complete";
}

/** Sidebar weekly-summary line based on lessons completed this week. */
export function weeklyMessageKey(count: number): string {
  const c = Number.isFinite(count) ? count : 0;
  if (c <= 0) return "learnWeb.microcopy.weekly.start";
  if (c <= 2) return "learnWeb.microcopy.weekly.nice";
  if (c <= 5) return "learnWeb.microcopy.weekly.roll";
  if (c <= 10) return "learnWeb.microcopy.weekly.great";
  return "learnWeb.microcopy.weekly.crushing";
}
