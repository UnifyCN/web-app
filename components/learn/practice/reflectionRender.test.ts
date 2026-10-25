import { createElement } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { PracticeProgress, SanityPractice } from "@/types";
import { MultipleChoiceQuestion } from "./MultipleChoiceQuestion";
import { PracticeQuestionList } from "./PracticeQuestionList";
import { QuizResults } from "./QuizResults";
import {
  CONFIDENCE_OPTION_KEYS,
  REFLECTION_QUESTION_KEY,
  SECTION_ID,
  SINGLE_CHOICE_QUESTION_KEY,
  block,
  correctAnswersFor,
  makeQuestion,
  option,
  practicesFor,
  questionByKey,
  questionsFor,
} from "./testing/reflectionFixtures";
import { buttonsIn, i18nFor, renderIn, textIn } from "./testing/renderHelpers";

// The page and the module row read content and progress through these hooks.
// The mock returns whatever a test puts in `learn`; no network, no React Query.
const learn = vi.hoisted(() => ({
  practices: undefined as unknown,
  moduleData: undefined as unknown,
  practiceProgress: undefined as unknown,
}));
vi.mock("@/hooks/useLearn", () => ({
  useModule: () => ({ data: learn.moduleData, isLoading: false }),
  useAllLessonProgresses: () => ({ data: {} }),
  usePractices: () => ({ data: learn.practices }),
  usePracticeProgress: () => ({ data: learn.practiceProgress }),
}));
// Show the collapsible content without framer-motion's animation wrapper.
vi.mock("@/components/ui/Collapse", () => ({
  Collapse: ({ children }: { children: unknown }) => children,
}));

const SELECTED_NEUTRAL = "border-ink bg-surface-gray";
const CORRECT_COLOURS = ["priority-optional"];
const WRONG_COLOURS = ["destructive"];

function reflection(lang: Parameters<typeof questionsFor>[0] = "en") {
  return questionByKey(questionsFor(lang), REFLECTION_QUESTION_KEY);
}

function mc(
  question: ReturnType<typeof reflection>,
  answer: string[],
  submitted: boolean,
  lang: Parameters<typeof renderIn>[1] = "en",
) {
  return renderIn(
    createElement(MultipleChoiceQuestion, {
      question,
      answer,
      submitted,
      onChange: () => undefined,
    }),
    lang,
  );
}

describe("submitted confidence check (real MultipleChoiceQuestion markup)", () => {
  test("a selection keeps its selected look and gets no correctness colour", () => {
    for (const selection of [
      [CONFIDENCE_OPTION_KEYS[0]],
      [CONFIDENCE_OPTION_KEYS[2]],
      [...CONFIDENCE_OPTION_KEYS],
    ]) {
      const html = mc(reflection(), selection, true);
      const buttons = buttonsIn(html);
      expect(buttons).toHaveLength(3);
      buttons.forEach((button, i) => {
        const selected = selection.includes(CONFIDENCE_OPTION_KEYS[i]);
        expect(button.includes('aria-pressed="true"')).toBe(selected);
        expect(button.includes(SELECTED_NEUTRAL)).toBe(selected);
        // Locked after submit.
        expect(button).toContain("disabled");
      });
      for (const colour of [...CORRECT_COLOURS, ...WRONG_COLOURS]) {
        expect(html, `${selection}`).not.toContain(colour);
      }
    }
  });

  test("the same markup renders in all seven languages without correctness colour", () => {
    for (const lang of ["en", "ar", "es", "fr-CA", "hi", "pa", "vi"] as const) {
      const html = mc(reflection(lang), [CONFIDENCE_OPTION_KEYS[1]], true, lang);
      expect(html, lang).toContain(SELECTED_NEUTRAL);
      expect(html, lang).not.toContain("destructive");
      expect(html, lang).not.toContain("priority-optional");
    }
  });

  test("before submit it stays selectable and unlocked", () => {
    const html = mc(reflection(), [CONFIDENCE_OPTION_KEYS[0]], false);
    const [first] = buttonsIn(html);
    expect(first).toContain('aria-pressed="true"');
    expect(first).not.toContain("disabled");
  });

  test("the knowledge instruction is gone for the reflection, in English and Vietnamese", () => {
    expect(mc(reflection(), [], false, "en")).not.toContain(
      "Select all that apply.",
    );
    const vi = mc(reflection("vi"), [], false, "vi");
    expect(vi).not.toContain("Chọn tất cả đáp án đúng.");
    expect(vi).not.toContain("Chọn tất cả");
  });

  test("the answer box still shows after submit and only then", () => {
    const question = reflection();
    const after = mc(question, [CONFIDENCE_OPTION_KEYS[0]], true);
    expect(after).toContain("Thanks for checking your confidence level!");
    expect(mc(question, [CONFIDENCE_OPTION_KEYS[0]], false)).not.toContain(
      "Thanks for checking your confidence level!",
    );
    const hidden = {
      ...question,
      answer_box: { ...question.answer_box, showAfterSubmit: false },
    };
    expect(mc(hidden, [CONFIDENCE_OPTION_KEYS[0]], true)).not.toContain(
      "Thanks for checking your confidence level!",
    );
  });
});

describe("knowledge controls keep their colours and instruction", () => {
  const knowledgeMulti = makeQuestion("km", "multiple_choice_multiple", {
    options: [option("a", true), option("b", false), option("c", false)],
  });

  test("a submitted knowledge multi-select marks correct green and wrong red", () => {
    const html = mc(knowledgeMulti, ["a", "b"], true);
    const [a, b, c] = buttonsIn(html);
    expect(a).toContain("priority-optional");
    expect(a).not.toContain("destructive");
    expect(b).toContain("destructive");
    expect(b).not.toContain("priority-optional");
    // An unselected, wrong option is plain.
    expect(c).not.toContain("destructive");
    expect(c).not.toContain("priority-optional");
  });

  test("an all-false knowledge multi-select still marks a pick wrong", () => {
    const allFalse = makeQuestion("af", "multiple_choice_multiple", {
      options: [option("a", false), option("b", false)],
    });
    const [a] = buttonsIn(mc(allFalse, ["a"], true));
    expect(a).toContain("destructive");
  });

  test("the instruction shows for a knowledge multi-select in English and Vietnamese", () => {
    expect(mc(knowledgeMulti, [], false, "en")).toContain("Select all that apply.");
    expect(mc(knowledgeMulti, [], false, "vi")).toContain(
      "Chọn tất cả đáp án đúng.",
    );
  });

  test("a knowledge single choice shows the correct option after submit", () => {
    const single = questionByKey(questionsFor("en"), SINGLE_CHOICE_QUESTION_KEY);
    const html = mc(single, [correctAnswersFor("en")[SINGLE_CHOICE_QUESTION_KEY][0]], true);
    expect(html).toContain("priority-optional");
    expect(html).not.toContain("destructive");
  });
});

describe("question breakdown (real PracticeQuestionList markup)", () => {
  const practices: SanityPractice[] = practicesFor("en");
  const answers = correctAnswersFor("en");
  const base: PracticeProgress = {
    submoduleId: SECTION_ID,
    currentQuestionIndex: 2,
    currentSubmitted: true,
    answers,
    isCompleted: true,
    score: 2,
    totalQuestions: 3,
    updatedAt: "2026-10-25T00:00:00Z",
  };
  const list = (progress: PracticeProgress | null, items = practices) =>
    renderIn(
      createElement(PracticeQuestionList, {
        practices: items,
        practiceProgress: progress,
      }),
    );

  test("a completed attempt: knowledge marked, reflection answered, header 2/2", () => {
    const html = list(base);
    expect(html).toContain('aria-label="Correct"');
    expect(html).toContain('aria-label="Reflection answered"');
    expect(html).not.toContain('aria-label="Incorrect"');
    expect(html).not.toContain('aria-label="Not answered"');
    expect(textIn(html)).toContain("Questions (3)");
    expect(textIn(html)).toContain("scored 2/2");
    expect(html).not.toContain("2/3");
    // The neutral row is neither green nor red.
    const reflectionRow = html.split("<li").find((row) =>
      row.includes("Reflection answered"),
    );
    expect(reflectionRow).toBeDefined();
    expect(reflectionRow).not.toContain("destructive");
    expect(reflectionRow).not.toContain("priority-optional");
    // All three questions stay in the list, numbered 1 to 3.
    expect(textIn(html)).toContain("Q3");
  });

  test("a wrong knowledge answer is still marked incorrect, and the score follows", () => {
    const wrongOption = questionByKey(questionsFor("en"), SINGLE_CHOICE_QUESTION_KEY)
      .options?.find((option) => !option.is_correct);
    expect(wrongOption).toBeDefined();
    const html = list({
      ...base,
      answers: { ...answers, [SINGLE_CHOICE_QUESTION_KEY]: [wrongOption?._key ?? ""] },
    });
    expect(html).toContain('aria-label="Incorrect"');
    expect(textIn(html)).toContain("scored 1/2");
  });

  test("stale saved choices do not produce a numerical score", () => {
    const html = list({
      ...base,
      answers: {...answers, [SINGLE_CHOICE_QUESTION_KEY]: ["removed-option"]},
    });
    expect(textIn(html)).not.toMatch(/scored \d+\/\d+/);
  });

  test("a draft is not shown as completed work", () => {
    const html = list({
      ...base,
      isCompleted: false,
      currentQuestionIndex: 2,
      currentSubmitted: false,
      score: null,
      totalQuestions: null,
    });
    // Questions before the saved position are submitted; the saved one is a draft.
    expect(html.match(/aria-label="Correct"/g)).toHaveLength(2);
    expect(html).toContain('aria-label="Draft saved, not submitted"');
    expect(html).not.toContain('aria-label="Reflection answered"');
    expect(textIn(html)).not.toContain("scored");
  });

  test("a submitted reflection before the end of an unfinished attempt is answered", () => {
    const html = list({
      ...base,
      isCompleted: false,
      currentQuestionIndex: 2,
      currentSubmitted: true,
      score: null,
      totalQuestions: null,
    });
    expect(html).toContain('aria-label="Reflection answered"');
    expect(textIn(html)).not.toContain("scored");
  });

  test("a legacy 2/3 with missing answers shows no score", () => {
    const { [REFLECTION_QUESTION_KEY]: dropped, ...rest } = answers;
    expect(dropped).toBeDefined();
    const html = list({ ...base, answers: rest });
    expect(textIn(html)).not.toContain("scored");
    expect(html).toContain('aria-label="Not answered"');
  });

  test("no saved progress: nothing answered, no score", () => {
    const html = list(null);
    expect(html.match(/aria-label="Not answered"/g)).toHaveLength(3);
    expect(textIn(html)).not.toContain("scored");
  });

  test("a legacy long answer is answered, not correct", () => {
    const long: SanityPractice = {
      _id: "p-long",
      _type: "practice",
      title: "Reflect",
      practice_type: "quiz",
      order_number: 1,
      questions: [
        makeQuestion("l", "long_answer", { question_text: [block("Tell us.")] }),
      ],
    };
    const html = list(
      { ...base, currentQuestionIndex: 0, answers: { l: ["words"] }, score: 1, totalQuestions: 1 },
      [long],
    );
    expect(html).toContain('aria-label="Reflection answered"');
    expect(html).not.toContain('aria-label="Correct"');
    expect(textIn(html)).not.toContain("scored");
  });

  test("the neutral and draft labels render in every language", () => {
    for (const lang of ["ar", "es", "fr-CA", "hi", "pa", "vi"] as const) {
      const t = i18nFor(lang).t.bind(i18nFor(lang));
      const html = renderIn(
        createElement(PracticeQuestionList, {
          practices: practicesFor(lang),
          practiceProgress: base,
        }),
        lang,
      );
      expect(html, lang).toContain(
        `aria-label="${t("learnWeb.practice.reflectionAnsweredAria")}"`,
      );
      expect(html, lang).not.toContain('aria-label="Reflection answered"');
      const draft = renderIn(
        createElement(PracticeQuestionList, {
          practices: practicesFor(lang),
          practiceProgress: { ...base, isCompleted: false, currentSubmitted: false },
        }),
        lang,
      );
      expect(draft, lang).toContain(
        `aria-label="${t("learnWeb.practice.draftAria")}"`,
      );
    }
  });
});

describe("results screen (real QuizResults markup)", () => {
  const results = (
    knowledge: { correct: number; total: number },
    includesReflection: boolean,
  ) =>
    renderIn(
      createElement(QuizResults, {
        knowledge,
        includesReflection,
        colorHex: "#f68b26",
        sectionHref: "/learn/m1/s1",
        onRetake: () => undefined,
      }),
    );

  test("mixed set: the fraction counts knowledge only and says reflections are not scored", () => {
    const html = results({ correct: 2, total: 2 }, true);
    const text = textIn(html);
    expect(text).toContain("2 / 2");
    expect(text).toContain("100% correct");
    expect(text).toContain("Great work!");
    expect(text).toContain("Reflection questions are not scored.");
    expect(text).not.toContain("/ 3");
  });

  test("knowledge-only set is unchanged: fraction, percent, message, no note", () => {
    const text = textIn(results({ correct: 1, total: 3 }, false));
    expect(text).toContain("Quiz complete");
    expect(text).toContain("1 / 3");
    expect(text).toContain("33% correct");
    expect(text).toContain("Keep practising");
    expect(text).not.toContain("not scored");
  });

  test("a low mixed score still talks only about the knowledge checks", () => {
    const text = textIn(results({ correct: 0, total: 2 }, true));
    expect(text).toContain("0 / 2");
    expect(text).toContain("Reflection questions are not scored.");
  });

  test("reflection-only: neutral completion, no number, percent or grade", () => {
    const html = results({ correct: 0, total: 0 }, true);
    const text = textIn(html);
    expect(text).toContain("Reflection complete");
    expect(text).toContain("Thanks for reflecting. Your answers are saved.");
    expect(text).not.toMatch(/\d/);
    for (const forbidden of [
      "correct",
      "Quiz complete",
      "Great work",
      "Nice effort",
      "Keep practising",
      "missed",
    ]) {
      expect(text.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
    // Retake and Back to section stay available.
    expect(text).toContain("Retake");
    expect(text).toContain("Back to section");
    expect(html).toContain('href="/learn/m1/s1"');
    expect(buttonsIn(html)).toHaveLength(1);
  });
});

describe("saved-score cards (real section page and module row)", () => {
  const progress = (over: Partial<PracticeProgress> = {}): PracticeProgress => ({
    submoduleId: SECTION_ID,
    currentQuestionIndex: 2,
    currentSubmitted: true,
    answers: correctAnswersFor("en"),
    isCompleted: true,
    score: 2,
    totalQuestions: 3,
    updatedAt: "2026-10-25T00:00:00Z",
    ...over,
  });

  // The row also prints lesson progress ("0/0 lesson"); only a practice score counts.
  const ROW_SCORE = /\d+\/\d+(?! lesson)/;

  beforeEach(() => {
    learn.practices = undefined;
    learn.practiceProgress = undefined;
    learn.moduleData = {
      _id: "m1",
      title: "Permanent residence",
      colorTheme: { hex: "#f68b26" },
      submodules: [{ _id: SECTION_ID, title: "Your responsibilities", lessons: [] }],
    };
  });

  async function renderPage() {
    const { default: Page } = await import(
      "@/app/(main)/learn/[moduleId]/[submoduleId]/page"
    );
    const value = { moduleId: "m1", submoduleId: SECTION_ID };
    // React's `use` reads a settled thenable without suspending.
    const params = Object.assign(Promise.resolve(value), {
      status: "fulfilled" as const,
      value,
    });
    return textIn(renderIn(createElement(Page, { params })));
  }

  async function renderRow(over: Partial<PracticeProgress> | null) {
    const { SubmoduleTimelineRow } = await import(
      "@/components/learn/SubmoduleTimelineRow"
    );
    return textIn(
      renderIn(
        createElement(SubmoduleTimelineRow, {
          moduleId: "m1",
          submoduleId: SECTION_ID,
          title: "Your responsibilities",
          lessonCount: 0,
          completedCount: 0,
          state: "completed",
          isActiveCTA: true,
          colorHex: "#f68b26",
          isFirst: true,
          isLast: true,
          lessons: [],
          progresses: {},
          hasPractice: true,
          practiceProgress: over === null ? undefined : progress(over),
        }),
      ),
    );
  }

  test("section card: completed legacy 2/3 with complete answers shows 2/2 and 100%", async () => {
    learn.practices = practicesFor("en");
    learn.practiceProgress = progress();
    const text = await renderPage();
    expect(text).toContain("2/2 · 100%");
    expect(text).not.toContain("2/3");
    expect(text).not.toContain("67%");
    expect(text).toContain("Review");
  });

  test("section card: missing saved answers shows no number but keeps Review", async () => {
    learn.practices = practicesFor("en");
    learn.practiceProgress = progress({ answers: {} });
    const text = await renderPage();
    expect(text).not.toMatch(/\d\/\d/);
    expect(text).toContain("Review");
  });

  test("section card: a null score still derives from complete answers", async () => {
    learn.practices = practicesFor("en");
    learn.practiceProgress = progress({ score: null });
    expect(await renderPage()).toContain("2/2 · 100%");
  });

  test("section card: reflection-only content shows no number", async () => {
    learn.practices = practicesFor("en").filter((p) => p._id.startsWith("4112da4b"));
    learn.practiceProgress = progress({
      score: 0,
      totalQuestions: 1,
      answers: { [REFLECTION_QUESTION_KEY]: [CONFIDENCE_OPTION_KEYS[0]] },
    });
    const text = await renderPage();
    expect(text).not.toMatch(/\d\/\d/);
    expect(text).not.toContain("%");
  });

  test("section card: knowledge-only content keeps the saved score", async () => {
    learn.practices = practicesFor("en").filter((p) => !p._id.startsWith("4112da4b"));
    learn.practiceProgress = progress({ score: 2, totalQuestions: 3 });
    expect(await renderPage()).toContain("2/3 · 67%");
  });

  test("section card: no content shows no card", async () => {
    learn.practices = [];
    learn.practiceProgress = progress();
    const text = await renderPage();
    expect(text).not.toMatch(/\d\/\d/);
  });

  test("module row: shows 2/2 for the completed mixed set", async () => {
    learn.practices = practicesFor("en");
    expect(await renderRow({})).toContain("2/2");
    expect(await renderRow({})).not.toContain("2/3");
  });

  test("module row: content still loading falls back to Done", async () => {
    learn.practices = undefined;
    const text = await renderRow({});
    expect(text).not.toMatch(ROW_SCORE);
    expect(text).toContain("Done");
  });

  test("module row: missing answers, null evidence or reflection-only show no number", async () => {
    learn.practices = practicesFor("en");
    expect(await renderRow({ answers: {} })).not.toMatch(ROW_SCORE);
    expect(await renderRow({ answers: {}, score: null })).toContain("Done");
    learn.practices = practicesFor("en").filter((p) => p._id.startsWith("4112da4b"));
    expect(
      await renderRow({
        score: 0,
        totalQuestions: 1,
        answers: { [REFLECTION_QUESTION_KEY]: [CONFIDENCE_OPTION_KEYS[0]] },
      }),
    ).not.toMatch(ROW_SCORE);
  });

  test("module row: knowledge-only content keeps the saved ratio; no progress shows the title", async () => {
    learn.practices = practicesFor("en").filter((p) => !p._id.startsWith("4112da4b"));
    expect(await renderRow({ score: 2, totalQuestions: 3 })).toContain("2/3");
    expect(await renderRow(null)).not.toMatch(ROW_SCORE);
  });

  test("module row: an unfinished attempt is neither Done nor scored", async () => {
    learn.practices = practicesFor("en");
    const text = await renderRow({ isCompleted: false, score: null });
    expect(text).not.toMatch(ROW_SCORE);
    expect(text).not.toContain("Done");
  });
});
