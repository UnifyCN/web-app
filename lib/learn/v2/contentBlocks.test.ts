import { describe, expect, it } from "vitest";
import type { SanityBlock, SanityLessonPage } from "@/types";
import type { LessonSection } from "@/types/lessonSections";
import {
  getOrderedLegacyPageNumber,
  knownSections,
  lessonPresentation,
  localizeLesson,
  stepSections,
  withOrderedLessonBlocks,
  withTranslatedSections,
} from "./contentBlocks";
import type { LessonBlock, LessonV2 } from "./types";

const para = (key: string, text: string): SanityBlock => ({
  _key: key,
  _type: "block",
  style: "normal",
  markDefs: [],
  children: [{ _key: `${key}-s`, _type: "span", text, marks: [] }],
});

const concept = (key: string, text: string): LessonSection => ({
  _type: "lessonConcept",
  _key: key,
  content: [para(`${key}-p`, text)],
});

const legacyPage = (key: string, order: number, text = key): SanityLessonPage => ({
  _key: key,
  _type: "page",
  order,
  content: [para(`${key}-p`, text)],
});

function lesson(overrides: Partial<LessonV2> = {}): LessonV2 {
  return {
    _id: "lesson-1",
    _type: "lesson",
    title: "Lesson",
    order: 1,
    ...overrides,
  };
}

const blocks: LessonBlock[] = [
  {
    _key: "teach",
    _type: "lesson_content",
    title: "Teach",
    content: [para("t1", "Teach text")],
    contentVersion: 2,
    sections: [concept("teach-c", "Teach section")],
    readingMinutes: 3,
  },
  { _key: "act", _type: "lesson_activity", title: "Try it", instructions: [] },
  {
    _key: "wrap",
    _type: "lesson_content",
    title: "Wrap up",
    content: [para("w1", "Wrap text")],
  },
];

describe("withOrderedLessonBlocks", () => {
  it("plays blocks in the array order the author set, one step each", () => {
    const result = withOrderedLessonBlocks(
      lesson({
        content_blocks: blocks,
        pages: [legacyPage("teach", 1)],
        ending_pages: [legacyPage("wrap", 1)],
      }),
    );
    expect(result.pages?.map((p) => p._key)).toEqual(["teach", "act", "wrap"]);
    expect(result.pages?.map((p) => p.order)).toEqual([0, 1, 2]);
    expect(result.pages?.[1].activity?._type).toBe("lesson_activity");
    expect(result.pages?.[1].content).toEqual([]);
    expect(result.pages?.[0]).toMatchObject({
      contentVersion: 2,
      readingMinutes: 3,
      title: "Teach",
    });
  });

  it("empties the legacy arrays and counts steps instead", () => {
    const result = withOrderedLessonBlocks(
      lesson({
        content_blocks: blocks,
        activity_pages: [legacyPage("act", 1)],
        ending_pages: [legacyPage("wrap", 1)],
      }),
    );
    expect(result.activity_pages).toEqual([]);
    expect(result.ending_pages).toEqual([]);
    expect(result).toMatchObject({
      lesson_page_count: 3,
      activity_page_count: 0,
      ending_page_count: 0,
    });
    // The originals are kept for mapping old resume positions.
    expect(result.legacyResumePages?.ending_pages?.[0]._key).toBe("wrap");
  });

  it("returns a lesson without blocks unchanged", () => {
    const legacy = lesson({ pages: [legacyPage("a", 1)] });
    expect(withOrderedLessonBlocks(legacy)).toBe(legacy);
    const empty = lesson({ content_blocks: [], pages: [legacyPage("a", 1)] });
    expect(withOrderedLessonBlocks(empty)).toBe(empty);
  });

  it("treats a block with sections but no content as an empty legacy body", () => {
    const result = withOrderedLessonBlocks(
      lesson({
        content_blocks: [
          {
            _key: "only-sections",
            _type: "lesson_content",
            content: null,
            contentVersion: 2,
            sections: [concept("c", "x")],
          },
        ],
      }),
    );
    expect(result.pages?.[0].content).toEqual([]);
    expect(result.pages?.[0].sections).toHaveLength(1);
  });
});

describe("getOrderedLegacyPageNumber", () => {
  const ordered = withOrderedLessonBlocks(
    lesson({
      content_blocks: blocks,
      activity_pages: [legacyPage("act", 1)],
      // Endings were sorted by `order` in the old reader.
      ending_pages: [legacyPage("other", 2), legacyPage("wrap", 1)],
    }),
  );

  it("maps an old ending position to its block step", () => {
    expect(
      getOrderedLegacyPageNumber({ lesson: ordered, pageType: "ending", pageNumber: 1 }),
    ).toBe(3);
  });

  it("maps an old activity position to its block step", () => {
    expect(
      getOrderedLegacyPageNumber({ lesson: ordered, pageType: "activity", pageNumber: 1 }),
    ).toBe(2);
  });

  it("is undefined when the page or block is missing or the type differs", () => {
    expect(
      getOrderedLegacyPageNumber({ lesson: ordered, pageType: "ending", pageNumber: 2 }),
    ).toBeUndefined(); // "other" has no block
    expect(
      getOrderedLegacyPageNumber({ lesson: ordered, pageType: "ending", pageNumber: 9 }),
    ).toBeUndefined();
    expect(
      getOrderedLegacyPageNumber({ lesson: ordered, pageType: "activity", pageNumber: 0 }),
    ).toBeUndefined();
    const wrongType = withOrderedLessonBlocks(
      lesson({ content_blocks: blocks, activity_pages: [legacyPage("teach", 1)] }),
    );
    expect(
      getOrderedLegacyPageNumber({ lesson: wrongType, pageType: "activity", pageNumber: 1 }),
    ).toBeUndefined();
    expect(
      getOrderedLegacyPageNumber({ lesson: lesson(), pageType: "ending", pageNumber: 1 }),
    ).toBeUndefined();
  });
});

describe("translations", () => {
  it("uses a translated page's own v2 sections", () => {
    const apply = withTranslatedSections([
      { _key: "teach", contentVersion: 2, sections: [concept("fr", "Bonjour")], readingMinutes: 4 },
    ]);
    const result = apply({
      _key: "teach",
      contentVersion: 2,
      sections: [concept("en", "Hello")],
      readingMinutes: 1,
    });
    expect(result.sections?.[0]._key).toBe("fr");
    expect(result.readingMinutes).toBe(4);
  });

  it("drops sections when the translation has none, so its legacy content shows", () => {
    const apply = withTranslatedSections([{ _key: "teach" }]);
    const result = apply({ _key: "teach", contentVersion: 2, sections: [concept("en", "Hello")] });
    expect(result.sections).toBeUndefined();
    expect(result.contentVersion).toBeUndefined();
  });

  it("never merges English sections into a translated page", () => {
    const apply = withTranslatedSections(undefined);
    const result = apply({ _key: "teach", contentVersion: 2, sections: [concept("en", "Hello")] });
    expect(result.sections).toBeUndefined();
  });

  it("localizes then orders a translated lesson, keeping block keys", () => {
    const frBlocks: LessonBlock[] = [
      {
        _key: "teach",
        _type: "lesson_content",
        content: [para("t1", "Texte")],
        contentVersion: 2,
        sections: [concept("teach-fr", "Section")],
      },
      { _key: "act", _type: "lesson_activity", title: "Essayez" },
    ];
    const merged = lesson({ content_blocks: frBlocks });
    const result = localizeLesson(merged, { content_blocks: frBlocks }, "fr-CA");
    expect(result.pages?.map((p) => p._key)).toEqual(["teach", "act"]);
    expect(result.pages?.[0].sections?.[0]._key).toBe("teach-fr");
  });

  it("falls back to legacy content when a translated block has no sections", () => {
    const viBlocks: LessonBlock[] = [
      { _key: "teach", _type: "lesson_content", content: [para("t1", "Nội dung")] },
    ];
    const result = localizeLesson(lesson({ content_blocks: viBlocks }), { content_blocks: viBlocks }, "vi");
    expect(result.pages?.[0].sections).toBeUndefined();
    expect(stepSections(result.pages![0])[0]).toMatchObject({
      _type: "lessonConcept",
      _key: "teach-concept",
    });
  });

  it("leaves English untouched apart from ordering", () => {
    const result = localizeLesson(lesson({ content_blocks: blocks }), null, "en");
    expect(result.pages?.[0].sections?.[0]._key).toBe("teach-c");
  });
});

describe("sections", () => {
  it("wraps legacy content in one Concept section keyed after the step", () => {
    const sections = stepSections(legacyPage("p1", 1, "Old text"));
    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({ _type: "lessonConcept", _key: "p1-concept" });
  });

  it("skips unknown section types and fills omitted lists", () => {
    const sections = knownSections([
      { _type: "lessonFaq", _key: "f" } as unknown as LessonSection,
      { _type: "lessonMystery", _key: "m" } as unknown as LessonSection,
      { _type: "lessonCitations", _key: "c" } as unknown as LessonSection,
    ]);
    expect(sections.map((s) => s._type)).toEqual(["lessonFaq", "lessonCitations"]);
    expect(sections[0]).toMatchObject({ items: [] });
    expect(sections[1]).toMatchObject({ sources: [] });
  });

  it("moves legacy examples and citations into their sections", () => {
    const citation = {
      ...para("cite", "Citations: Government of Canada"),
      markDefs: [{ _key: "l", _type: "link", href: "https://canada.ca/a" }],
    };
    const exampleBox = {
      _key: "ex",
      _type: "example_box",
      content: [para("ex-p", "Amir checked Canada.ca")],
    } as unknown as SanityBlock;
    const { sections, citationContent } = lessonPresentation([
      { _type: "lessonConcept", _key: "c", content: [para("keep", "Keep me"), exampleBox, citation] },
      { _type: "lessonExample", _key: "e", theory: [], practice: [para("prac", "Existing")] },
      {
        _type: "lessonCitations",
        _key: "s",
        sources: [
          { _key: "a", title: "A", url: "https://canada.ca/a" },
          { _key: "b", title: "B", url: "https://canada.ca/b" },
        ],
      },
    ]);
    const [c, e, s] = sections;
    expect(c._type === "lessonConcept" && c.content.map((b) => b._key)).toEqual(["keep"]);
    expect(e._type === "lessonExample" && e.practice.map((b) => b._key)).toEqual(["ex-p", "prac"]);
    expect(s._type === "lessonCitations" && s.sources.map((x) => x._key)).toEqual(["b"]);
    expect(citationContent.map((b) => b._key)).toEqual(["cite"]);
  });

  it("leaves examples in place when the step has no Example section", () => {
    const exampleBox = { _key: "ex", _type: "example_box", content: [] } as unknown as SanityBlock;
    const { sections } = lessonPresentation([
      { _type: "lessonConcept", _key: "c", content: [exampleBox] },
    ]);
    expect(sections[0]._type === "lessonConcept" && sections[0].content).toHaveLength(1);
  });
});
