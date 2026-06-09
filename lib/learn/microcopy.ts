/**
 * Encouraging microcopy for the Learn section — small contextual nudges keyed
 * to progress. Kept in one place so the wording stays consistent.
 */

/** Module-card line based on completion percent (0–100). */
export function moduleProgressMessage(percent: number): string {
  const safe = Number.isFinite(percent) ? percent : 0;
  const p = Math.max(0, Math.min(100, Math.round(safe)));
  if (p === 0) return "Begin your journey";
  if (p <= 25) return "Good start! Keep going";
  if (p <= 50) return "You're making progress!";
  if (p <= 75) return "More than halfway there!";
  if (p <= 99) return "Almost done! Just a few lessons left";
  return "✓ Complete 🎉";
}

/** Sidebar weekly-summary line based on lessons completed this week. */
export function weeklyMessage(count: number): string {
  const c = Number.isFinite(count) ? count : 0;
  if (c <= 0) return "Start learning this week!";
  if (c <= 2) return "Nice start this week!";
  if (c <= 5) return "You're on a roll this week!";
  if (c <= 10) return "Great progress this week! 🎉";
  return "You're crushing it this week! 🔥";
}
