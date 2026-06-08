import type { SanityBlock, SanityLessonPage } from "@/types";

/**
 * Read-time estimation for lessons. Mobile has no equivalent util — 200 wpm is
 * the conventional web reading speed. Word counts come from the portable-text
 * spans on a lesson's content pages.
 */

const WORDS_PER_MINUTE = 200;

/** Count words across an array of standard portable-text blocks. */
export function wordCountOfBlocks(blocks: SanityBlock[] | undefined): number {
  if (!blocks) return 0;
  let count = 0;
  for (const block of blocks) {
    // Only standard text blocks carry `children` spans with text; custom
    // types (callout boxes, images, checklists) contribute nothing here.
    const children = block?.children;
    if (!Array.isArray(children)) continue;
    for (const span of children) {
      const text = typeof span?.text === "string" ? span.text : "";
      count += text.trim().split(/\s+/).filter(Boolean).length;
    }
  }
  return count;
}

/**
 * Estimate read time, in whole minutes (min 1), for a lesson's content pages.
 * Pass the lesson's `pages` (+ optional `ending_pages`); `undefined` entries
 * are skipped so callers can spread both arrays.
 */
export function estimateReadMinutes(
  pages: (SanityLessonPage | undefined)[] | undefined,
): number {
  if (!pages || pages.length === 0) return 1;
  let words = 0;
  for (const page of pages) {
    if (!page) continue;
    words += wordCountOfBlocks(page.content);
  }
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}

/** Convenience: read time for a lesson given its pages + ending pages. */
export function lessonReadMinutes(lesson: {
  pages?: SanityLessonPage[];
  ending_pages?: SanityLessonPage[];
}): number {
  return estimateReadMinutes([
    ...(lesson.pages ?? []),
    ...(lesson.ending_pages ?? []),
  ]);
}
