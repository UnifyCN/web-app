import type { SanityBlock, SanityLessonPage } from "@/types";

/**
 * Read-time estimation for lessons. Mobile has no equivalent util — 200 wpm is
 * the conventional web reading speed. Word counts come from the portable-text
 * spans on a lesson's content pages.
 */

const WORDS_PER_MINUTE = 200;

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Count words across portable-text blocks, including the custom lesson block
 * types: standard blocks (`children` spans), callout boxes + `dropdown`
 * (`content` of nested blocks, recursed), and `checklist_checkbox` / `dropdown`
 * labels. (`image` blocks contribute nothing.)
 */
export function wordCountOfBlocks(blocks: SanityBlock[] | undefined): number {
  if (!blocks) return 0;
  let count = 0;
  for (const block of blocks) {
    const b = block as unknown as {
      children?: { text?: string }[];
      content?: SanityBlock[];
      label?: string;
    };
    if (Array.isArray(b.children)) {
      for (const span of b.children) {
        if (typeof span?.text === "string") count += countWords(span.text);
      }
      continue;
    }
    if (Array.isArray(b.content)) count += wordCountOfBlocks(b.content);
    if (typeof b.label === "string") count += countWords(b.label);
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
