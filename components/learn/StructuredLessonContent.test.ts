import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import {
  StructuredLessonContent,
  hasRenderableSections,
} from "./StructuredLessonContent";
import type { LessonSection } from "@/types/lessonSections";

const render = (sections: unknown[]) =>
  renderToStaticMarkup(
    createElement(StructuredLessonContent, {
      sections: sections as LessonSection[],
      renderRich: (blocks) => `rich:${blocks.length}`,
    }),
  );

test("sections whose arrays Sanity omitted render without throwing", () => {
  const html = render([
    { _type: "lessonConcept", _key: "c" },
    { _type: "lessonExample", _key: "e" },
    { _type: "lessonVisual", _key: "v" },
    { _type: "lessonQuickCheck", _key: "q", question: "Which one?" },
    { _type: "lessonFaq", _key: "f" },
    { _type: "lessonCitations", _key: "s" },
  ]);
  expect(html).toContain('id="section-c"');
  expect(html).toContain("Which one?");
  expect(html).toContain('id="section-s"');
});

test("unknown section types are skipped from nav and numbering", () => {
  const html = render([
    { _type: "lessonFuture", _key: "x", title: "Future" },
    { _type: "lessonConcept", _key: "c", title: "Basics", content: [] },
  ]);
  expect(html).not.toContain("Future");
  expect(html).not.toContain("section-x");
  expect(html).toMatch(/>1<\/span>Basics/);
});

test("citation links only for http(s) URLs", () => {
  const html = render([
    {
      _type: "lessonCitations",
      _key: "s",
      sources: [
        { _key: "a", title: "Safe", url: "https://canada.ca" },
        { _key: "b", title: "Unsafe", url: "javascript:alert(1)" },
        { _key: "c", title: "Missing" },
      ],
    },
  ]);
  expect(html).toContain('href="https://canada.ca"');
  expect(html).not.toContain("javascript:");
  expect(html).toContain("<span>Missing</span>");
});

test("a page with only unknown section types falls back to legacy content", () => {
  const unknownOnly = [{ _type: "lessonFuture", _key: "x" }] as unknown as LessonSection[];
  expect(hasRenderableSections(unknownOnly)).toBe(false);
  expect(hasRenderableSections([])).toBe(false);
  expect(hasRenderableSections(undefined)).toBe(false);
  expect(
    hasRenderableSections([
      ...unknownOnly,
      { _type: "lessonConcept", _key: "c", content: [] },
    ]),
  ).toBe(true);
});
