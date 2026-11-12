import type { SanityBlock, SanityLessonPage } from "@/types";
import type { LessonRichContent, LessonSection } from "@/types/lessonSections";
import type {
  LessonBlock,
  LessonContentBlock,
  LessonStep,
  LessonV2,
} from "./types";

/*
 * Ported from the mobile app so both apps play a lesson the same way and save
 * the same step numbers:
 *   utils/lessonContentBlocks.ts  (withOrderedLessonBlocks, getOrderedLegacyPageNumber)
 *   services/sanity/lessons.ts    (withTranslatedSections)
 *   utils/lessonPresentation.ts   (lessonPresentation)
 * Keep the behaviour identical. If mobile changes one, change it here too.
 */

/**
 * Present ordered blocks as reader steps. Array order is authoritative; block
 * keys survive translation and reordering, so they are also the highlight
 * `page_key`. A lesson without blocks is returned unchanged.
 */
export function withOrderedLessonBlocks(lesson: LessonV2): LessonV2 {
  const blocks = lesson.content_blocks;
  if (!blocks?.length) return lesson;

  return {
    ...lesson,
    legacyResumePages: lesson.legacyResumePages ?? {
      activity_pages: lesson.activity_pages,
      ending_pages: lesson.ending_pages,
    },
    pages: blocks.map((block, index): LessonStep =>
      block._type === "lesson_activity"
        ? {
            _key: block._key,
            title: block.title,
            order: index,
            content: [],
            activity: block,
          }
        : {
            _key: block._key,
            title: block.title,
            order: index,
            content: (block.content ?? []) as SanityBlock[],
            markDefs: block.markDefs,
            contentVersion: block.contentVersion,
            sections: block.sections,
            readingMinutes: block.readingMinutes,
          },
    ),
    activity_pages: [],
    ending_pages: [],
    lesson_page_count: blocks.length,
    activity_page_count: 0,
    ending_page_count: 0,
  };
}

/**
 * Map a resume position saved by the legacy flow (`activity` N or `ending` N)
 * to its 1-based step in the ordered reader, by block `_key` and type.
 * Undefined when the lesson has no blocks or the position can't be matched.
 */
export function getOrderedLegacyPageNumber({
  lesson,
  pageType,
  pageNumber,
}: {
  lesson: LessonV2 | null | undefined;
  pageType: "activity" | "ending";
  pageNumber: number;
}): number | undefined {
  const blocks = lesson?.content_blocks;
  if (
    !lesson ||
    !blocks?.length ||
    !Number.isInteger(pageNumber) ||
    pageNumber < 1
  ) {
    return undefined;
  }
  const legacy = lesson.legacyResumePages ?? lesson;
  // Ending routes were sorted by order; activity routes used array position.
  const pages =
    pageType === "ending"
      ? [...(legacy.ending_pages ?? [])].sort((a, b) => a.order - b.order)
      : legacy.activity_pages;
  const page = pages?.[pageNumber - 1];
  if (!page) return undefined;
  const type = pageType === "activity" ? "lesson_activity" : "lesson_content";
  const index = blocks.findIndex(
    (block) => block._key === page._key && block._type === type,
  );
  return index < 0 ? undefined : index + 1;
}

type SectionedPage = {
  _key: string;
  contentVersion?: 2;
  sections?: LessonSection[];
  readingMinutes?: number;
};

/**
 * Section keys can change independently during authoring, so an English
 * section tree is never merged into a translated page. A translated page uses
 * its own sections only when it has v2 sections; otherwise its translated
 * legacy `content` stays readable (sections dropped).
 */
export function withTranslatedSections(
  translatedPages: SectionedPage[] | null | undefined,
) {
  const byKey = new Map((translatedPages ?? []).map((p) => [p._key, p]));
  return <T extends SectionedPage>(page: T): T => {
    const translated = byKey.get(page._key);
    if (translated?.contentVersion === 2 && translated.sections?.length) {
      return {
        ...page,
        contentVersion: 2,
        sections: translated.sections,
        readingMinutes: translated.readingMinutes,
      };
    }
    return { ...page, contentVersion: undefined, sections: undefined };
  };
}

/**
 * Apply a lesson's translation overlay the way mobile's `getLesson` does, then
 * order its blocks. `merged` is the lesson with the overlay already merged
 * (`mergeI18nOverlay`); `overlay` is the raw `i18n` object (null for English).
 */
export function localizeLesson(
  merged: LessonV2,
  overlay: Partial<LessonV2> | null | undefined,
  language: string,
): LessonV2 {
  if (language === "en") return withOrderedLessonBlocks(merged);
  const translateBlock = withTranslatedSections(
    (overlay?.content_blocks ?? []).filter(
      (b): b is LessonContentBlock => b._type === "lesson_content",
    ),
  );
  return withOrderedLessonBlocks({
    ...merged,
    pages: merged.pages?.map(
      withTranslatedSections(overlay?.pages as SectionedPage[] | undefined),
    ),
    content_blocks: merged.content_blocks?.map((block): LessonBlock =>
      block._type === "lesson_content" ? translateBlock(block) : block,
    ),
  });
}

const SECTION_TYPES = new Set([
  "lessonConcept",
  "lessonExample",
  "lessonVisual",
  "lessonQuickCheck",
  "lessonFaq",
  "lessonCitations",
]);

/**
 * The sections a step renders. A step with v2 sections uses them; otherwise its
 * whole legacy content becomes one Concept section keyed `${_key}-concept`
 * (mobile `pages/[pageNum].tsx`).
 */
export function stepSections(
  step: LessonStep | SanityLessonPage,
): LessonSection[] {
  // v2 only when at least one section is a type the reader knows; otherwise
  // the legacy content stays readable.
  if (
    step.contentVersion === 2 &&
    step.sections?.some((s) => SECTION_TYPES.has(s._type))
  ) {
    return step.sections;
  }
  return [
    {
      _type: "lessonConcept",
      _key: `${step._key}-concept`,
      content: (step.content ?? []) as LessonRichContent,
    },
  ];
}

/** Sections of a type the reader knows. Unknown types are skipped, and Sanity
 * omits empty arrays, so list fields are filled in as empty. */
export function knownSections(sections: LessonSection[]): LessonSection[] {
  return sections
    .filter((s) => SECTION_TYPES.has(s._type))
    .map((s) => {
      switch (s._type) {
        case "lessonConcept":
          return { ...s, content: s.content ?? [] };
        case "lessonExample":
          return { ...s, theory: s.theory ?? [], practice: s.practice ?? [] };
        case "lessonQuickCheck":
          return { ...s, options: s.options ?? [] };
        case "lessonFaq":
          return { ...s, items: s.items ?? [] };
        case "lessonCitations":
          return { ...s, sources: s.sources ?? [] };
        default:
          return s;
      }
    });
}

type RawBlock = {
  _type?: string;
  content?: unknown;
  children?: { text?: string }[];
  markDefs?: { _type?: string; href?: string }[];
};

/**
 * Move retained legacy examples and citations into their v2 sections without
 * changing stored keys: `example_box` content in a Concept moves to the
 * Example's practice, and "Citation(s):" paragraphs with links move out of the
 * Concept (returned as `citationContent`), dropping duplicate sources.
 */
export function lessonPresentation(sections: LessonSection[]): {
  sections: LessonSection[];
  citationContent: LessonRichContent;
} {
  const example = sections.find((s) => s._type === "lessonExample");
  const citations = sections.find((s) => s._type === "lessonCitations");
  const examples: LessonRichContent = [];
  const citationContent: LessonRichContent = [];
  const movedUrls = new Set<string>();
  const result = sections
    .map((section) => {
      if (section._type !== "lessonConcept") return section;
      const content = (section.content ?? []).filter((block) => {
        const raw = block as unknown as RawBlock;
        if (
          example &&
          raw._type === "example_box" &&
          Array.isArray(raw.content)
        ) {
          examples.push(...(raw.content as LessonRichContent));
          return false;
        }
        if (citations && raw._type === "block") {
          const text = (raw.children ?? [])
            .map((span) => span.text ?? "")
            .join("")
            .trim();
          const links = (raw.markDefs ?? []).filter(
            (mark) => mark._type === "link" && mark.href,
          );
          if (/^citations?\s*:/i.test(text) && links.length) {
            citationContent.push(block);
            links.forEach((link) => movedUrls.add(link.href as string));
            return false;
          }
        }
        return true;
      });
      return { ...section, content };
    })
    .map((section) => {
      if (section === example && section._type === "lessonExample") {
        return {
          ...section,
          practice: [...examples, ...(section.practice ?? [])],
        };
      }
      if (section === citations && section._type === "lessonCitations") {
        return {
          ...section,
          sources: (section.sources ?? []).filter((s) => !movedUrls.has(s.url)),
        };
      }
      return section;
    });
  return { sections: result, citationContent };
}
