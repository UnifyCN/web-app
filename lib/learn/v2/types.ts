import type { SanityBlock, SanityLesson, SanityLessonPage } from "@/types";
import type { LessonSection } from "@/types/lessonSections";

/**
 * Learn v2 content types. Lessons carry an ordered `content_blocks[]` array
 * (mobile PR #313): teaching blocks and activity blocks, played in the order
 * the author set. Shapes match the mobile app's `types/sanity.ts`.
 */

export interface LessonContentBlock {
  _key: string;
  _type: "lesson_content";
  title?: string;
  /** Legacy portable text. Some blocks carry only `sections`. */
  content?: SanityBlock[] | null;
  markDefs?: unknown[];
  contentVersion?: 2;
  sections?: LessonSection[];
  readingMinutes?: number;
}

export interface LessonActivityBlock {
  _key: string;
  _type: "lesson_activity";
  title?: string;
  instructions?: unknown[];
  answer_box?: unknown[];
}

export type LessonBlock = LessonContentBlock | LessonActivityBlock;

/** One step of the v2 reader: a teaching page, or an activity. */
export interface LessonStep extends Omit<SanityLessonPage, "_type" | "content"> {
  _type?: SanityLessonPage["_type"];
  content: SanityBlock[];
  markDefs?: unknown[];
  /** Set when the step is an activity block. */
  activity?: LessonActivityBlock;
}

export interface LessonV2 extends Omit<SanityLesson, "pages"> {
  submodule?: { _ref: string };
  content_blocks?: LessonBlock[] | null;
  pages?: LessonStep[];
  /** The legacy arrays as they were before blocks were applied, kept so an
   * old resume position (`activity` / `ending`) can be mapped to its block. */
  legacyResumePages?: {
    activity_pages?: SanityLessonPage[];
    ending_pages?: SanityLessonPage[];
  };
  lesson_page_count?: number;
  activity_page_count?: number;
  ending_page_count?: number;
}

/** A quiz attached to a lesson, as counted for the progress denominator. */
export interface LessonQuizStub {
  _id: string;
  question_count?: number | null;
}
