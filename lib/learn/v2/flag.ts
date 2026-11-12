/**
 * Learn v2 ("Courses" redesign) feature flag. On only when
 * `NEXT_PUBLIC_LEARN_V2` is exactly "true"; unset or anything else keeps the
 * current Learn. It is inlined at build time, so changing it needs a redeploy.
 * Launch steps: docs/learn-v2.md.
 */
export function isLearnV2Enabled(
  value: string | undefined = process.env.NEXT_PUBLIC_LEARN_V2,
): boolean {
  return value === "true";
}
