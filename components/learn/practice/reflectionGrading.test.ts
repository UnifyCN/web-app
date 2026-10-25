import { describe, expect, test } from "vitest";
import {
  LESSON_QUIZ_QUERY,
  PRACTICES_BY_SUBMODULE_QUERY,
} from "@/lib/sanity";
import type { SanityPractice, SanityQuizQuestion } from "@/types";
import { flattenPractices } from "./flattenPractices";
import {
  gradeAnswer,
  hasNeutralQuestion,
  isAnswered,
  isNeutralQuestion,
  scoreToSave,
  summarizeKnowledge,
} from "./grade";
import {
  displayKnowledgeScore,
  questionStatus,
  wasSubmitted,
} from "./savedScore";
import {
  CONFIDENCE_OPTION_KEYS,
  FIXTURE_LANGS,
  FIXTURE_LINE_SHA256,
  RAW_FIXTURE_DOCS,
  REFLECTION_QUESTION_KEY,
  SINGLE_CHOICE_QUESTION_KEY,
  TRUE_FALSE_QUESTION_KEY,
  block,
  correctAnswersFor,
  correctOptionKeys,
  lineHash,
  makeQuestion,
  option,
  practicesFor,
  questionByKey,
  questionsFor,
  reflectionPractice,
} from "./testing/reflectionFixtures";

/** Every non-empty subset of `keys` (7 for three keys), in a stable order. */
function nonEmptySubsets<T>(keys: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let mask = 1; mask < 1 << keys.length; mask++) {
    out.push(keys.filter((_, i) => (mask & (1 << i)) !== 0));
  }
  return out;
}

/**
 * The grading rule as pinned at web commit 86380faf (grade.ts, boolean
 * `gradeQuestion`), kept here only to show what the old rule said about the
 * real data. It is a copy for contrast, not the code under test.
 */
function pinnedLegacyGrade(q: SanityQuizQuestion, answer: string[]): boolean {
  if (q.question_type === "long_answer") {
    return (answer[0]?.trim().length ?? 0) > 0;
  }
  const correct = (q.options ?? [])
    .filter((o) => o.is_correct)
    .map((o) => o._key);
  const picked = new Set(answer);
  return (
    correct.length > 0 &&
    picked.size === correct.length &&
    correct.every((k) => picked.has(k))
  );
}

describe("fixture integrity", () => {
  test("all 21 documents are unchanged from the reviewed export", () => {
    expect(RAW_FIXTURE_DOCS).toHaveLength(21);
    expect(Object.keys(FIXTURE_LINE_SHA256)).toHaveLength(21);
    for (const doc of RAW_FIXTURE_DOCS) {
      const id = (doc as { _id: string })._id;
      expect(lineHash(doc), id).toBe(FIXTURE_LINE_SHA256[id]);
    }
  });

  test("the seven target documents carry the original reflection question", () => {
    for (const lang of FIXTURE_LANGS) {
      const practice = reflectionPractice(lang);
      expect(practice._id.startsWith("4112da4b")).toBe(true);
      const instruction = practice.pages?.[0].instructions?.find(
        (i) => i._key === REFLECTION_QUESTION_KEY,
      );
      expect(instruction?._type, lang).toBe("multiple_choice_multiple");
      expect(instruction?.gradingMode, lang).toBe("reflection");
      expect(
        instruction?.options?.map((o) => [o._key, o.is_correct]),
        lang,
      ).toEqual(CONFIDENCE_OPTION_KEYS.map((k) => [k, false]));
    }
  });
});

describe("activity adapter keeps the reflection metadata and the original data", () => {
  test.each(FIXTURE_LANGS)(
    "%s: flat sequence, indexes, options, metadata",
    (lang) => {
      const flat = flattenPractices(practicesFor(lang));
      expect(flat.map((f) => f.question._key)).toEqual([
        TRUE_FALSE_QUESTION_KEY,
        SINGLE_CHOICE_QUESTION_KEY,
        REFLECTION_QUESTION_KEY,
      ]);
      expect(flat.map((f) => f.question.order_number)).toEqual([0, 1, 2]);

      const reflection = flat[2].question;
      const source = reflectionPractice(lang).pages?.[0].instructions?.find(
        (i) => i._key === REFLECTION_QUESTION_KEY,
      );
      expect(reflection.question_type).toBe("multiple_choice_multiple");
      expect(reflection.gradingMode).toBe("reflection");
      // Same options: keys, values, text and false flags, in the same order.
      expect(reflection.options).toEqual(source?.options);
      expect(reflection.options?.map((o) => o._key)).toEqual([
        ...CONFIDENCE_OPTION_KEYS,
      ]);
      expect(reflection.options?.every((o) => o.is_correct === false)).toBe(
        true,
      );
      expect(reflection.answer_box).toEqual(
        reflectionPractice(lang).pages?.[0].answer_box,
      );

      // Knowledge questions keep their exact shape: no mode key is invented.
      for (const { question } of flat.slice(0, 2)) {
        expect(Object.hasOwn(question, "gradingMode")).toBe(false);
        expect(isNeutralQuestion(question)).toBe(false);
      }
    },
  );

  test("a quiz-shaped practice keeps the mode through the shared path", () => {
    const quiz: SanityPractice = {
      _id: "quiz-1",
      _type: "practice",
      title: "Quiz",
      practice_type: "quiz",
      order_number: 1,
      questions: [
        makeQuestion("k", "multiple_choice_single", {
          options: [option("a", true), option("b", false)],
        }),
        makeQuestion("r", "multiple_choice_multiple", {
          gradingMode: "reflection",
          options: [option("x", false), option("y", false)],
        }),
      ],
    };
    const flat = flattenPractices([quiz]);
    expect(flat.map((f) => f.question.order_number)).toEqual([0, 1]);
    expect(Object.hasOwn(flat[0].question, "gradingMode")).toBe(false);
    expect(flat[1].question.gradingMode).toBe("reflection");
    expect(isNeutralQuestion(flat[1].question)).toBe(true);
  });

  test("query projections select gradingMode for base and translated quiz questions", () => {
    // Source selection only: this does not prove what Sanity returns.
    const occurrences = (query: string) =>
      query.split("gradingMode").length - 1;
    // Each query uses the quiz fields once for the base document and once in
    // the translation overlay.
    expect(occurrences(PRACTICES_BY_SUBMODULE_QUERY)).toBe(2);
    expect(occurrences(LESSON_QUIZ_QUERY)).toBe(2);
  });
});

describe("the real confidence check is neutral for every selection", () => {
  test("21 single choices and 49 non-empty selections: answered, neutral, data untouched", () => {
    let singles = 0;
    let all = 0;
    for (const lang of FIXTURE_LANGS) {
      const question = questionByKey(
        questionsFor(lang),
        REFLECTION_QUESTION_KEY,
      );
      const before = JSON.stringify(question.options);
      for (const selection of nonEmptySubsets([...CONFIDENCE_OPTION_KEYS])) {
        all += 1;
        if (selection.length === 1) singles += 1;
        expect(isAnswered(question, selection), `${lang} ${selection}`).toBe(
          true,
        );
        expect(gradeAnswer(question, selection), `${lang} ${selection}`).toEqual(
          { kind: "neutral" },
        );
        // The old rule called every one of these wrong.
        expect(pinnedLegacyGrade(question, selection)).toBe(false);
      }
      expect(JSON.stringify(question.options)).toBe(before);
      expect(isAnswered(question, [])).toBe(false);
    }
    expect(singles).toBe(21);
    expect(all).toBe(49);
  });

  test("neutral does not depend on the option flags or the question type", () => {
    const withCorrectFlag = makeQuestion("r", "multiple_choice_multiple", {
      gradingMode: "reflection",
      options: [option("a", true), option("b", false)],
    });
    expect(gradeAnswer(withCorrectFlag, ["a"])).toEqual({ kind: "neutral" });
    expect(gradeAnswer(withCorrectFlag, ["b"])).toEqual({ kind: "neutral" });

    const reflectionSingle = makeQuestion("r2", "multiple_choice_single", {
      gradingMode: "reflection",
      options: [option("a", true), option("b", false)],
    });
    expect(isNeutralQuestion(reflectionSingle)).toBe(true);
  });

  test("all-false flags, a reflective prompt or a missing accepted answer never infer reflection", () => {
    // The real confidence question without its mode is an ordinary knowledge
    // question with no correct option: every pick is incorrect.
    const { gradingMode: dropped, ...withoutMode } = questionsFor("en")[2];
    expect(dropped).toBe("reflection");
    expect(isNeutralQuestion(withoutMode)).toBe(false);
    expect(gradeAnswer(withoutMode, [CONFIDENCE_OPTION_KEYS[0]])).toEqual({
      kind: "knowledge",
      correct: false,
    });
    const reflectivePrompt = makeQuestion("t", "short_answer", {
      question_text: [block("How confident do you feel? Reflect on it.")],
    });
    expect(gradeAnswer(reflectivePrompt, ["anything"])).toEqual({
      kind: "knowledge",
      correct: true, // existing fallback: no accepted answer, any text passes
    });
  });
});

describe("knowledge grading keeps every existing rule", () => {
  const knowledge = (q: SanityQuizQuestion, answer: string[]) => {
    const grade = gradeAnswer(q, answer);
    if (grade.kind !== "knowledge") throw new Error("expected a knowledge grade");
    return grade.correct;
  };

  test.each([
    ["missing mode", undefined],
    ["explicit knowledge", "knowledge" as const],
  ])("single choice with %s", (_label, mode) => {
    const q = makeQuestion("s", "multiple_choice_single", {
      gradingMode: mode,
      options: [option("a", true), option("b", false), option("c", false)],
    });
    expect(knowledge(q, ["a"])).toBe(true);
    expect(knowledge(q, ["b"])).toBe(false);
    expect(knowledge(q, ["a", "b"])).toBe(false);
    expect(knowledge(q, [])).toBe(false);
  });

  test("multi-select needs the exact set, in any order", () => {
    const q = makeQuestion("m", "multiple_choice_multiple", {
      options: [option("a", true), option("b", true), option("c", false)],
    });
    expect(knowledge(q, ["a", "b"])).toBe(true);
    expect(knowledge(q, ["b", "a"])).toBe(true);
    expect(knowledge(q, ["a"])).toBe(false);
    expect(knowledge(q, ["a", "b", "c"])).toBe(false);
  });

  test.each([undefined, "knowledge" as const])(
    "an all-false knowledge multi-select stays incorrect (mode: %s)",
    (mode) => {
      const q = makeQuestion("f", "multiple_choice_multiple", {
        gradingMode: mode,
        options: [option("a", false), option("b", false)],
      });
      for (const selection of [["a"], ["b"], ["a", "b"]]) {
        expect(knowledge(q, selection)).toBe(false);
      }
    },
  );

  test("true/false", () => {
    const q = makeQuestion("tf", "true_false", {
      options: [option("t", true), option("f", false)],
    });
    expect(knowledge(q, ["t"])).toBe(true);
    expect(knowledge(q, ["f"])).toBe(false);
  });

  test("matching needs every pair right", () => {
    const q = makeQuestion("mt", "matching", {
      matching_pairs: [
        { _key: "p1", left_item: "L1", right_item: "R1" },
        { _key: "p2", left_item: "L2", right_item: "R2" },
      ],
    });
    expect(knowledge(q, ["p1::R1", "p2::R2"])).toBe(true);
    expect(knowledge(q, ["p1::R1", "p2::R1"])).toBe(false);
    expect(knowledge(q, ["p1::R1"])).toBe(false);
  });

  test.each(["short_answer", "fill_blank"] as const)(
    "%s: normalized accepted text and the no-accepted-answer fallback",
    (type) => {
      const accepted = makeQuestion("a", type, {
        correct_answer: { value: ["Permanent Resident", "PR"] },
      });
      expect(knowledge(accepted, ["  permanent resident "])).toBe(true);
      expect(knowledge(accepted, ["pr"])).toBe(true);
      expect(knowledge(accepted, ["citizen"])).toBe(false);
      const open = makeQuestion("o", type);
      expect(knowledge(open, ["anything"])).toBe(true);
      expect(knowledge(open, ["   "])).toBe(false);
    },
  );
});

describe("legacy long_answer is neutral", () => {
  test.each([[[""]], [["   "]], [["A long thoughtful answer."]]])(
    "answer %j is neutral",
    (answer) => {
      const q = makeQuestion("l", "long_answer");
      expect(gradeAnswer(q, answer)).toEqual({ kind: "neutral" });
      expect(isAnswered(q, answer)).toBe(answer[0].trim().length > 0);
    },
  );

  test("it stays neutral with accepted text or an explicit knowledge mode", () => {
    const q = makeQuestion("l", "long_answer", {
      gradingMode: "knowledge",
      correct_answer: { value: ["yes"] },
    });
    expect(gradeAnswer(q, ["no"])).toEqual({ kind: "neutral" });
  });

  test("the old rule counted a non-empty long answer as a point", () => {
    const q = makeQuestion("l", "long_answer");
    expect(pinnedLegacyGrade(q, ["words"])).toBe(true);
    expect(summarizeKnowledge([q], { l: ["words"] })).toEqual({
      correct: 0,
      total: 0,
    });
  });
});

describe("knowledge summaries", () => {
  test.each(FIXTURE_LANGS)(
    "%s: two correct answers plus the confidence check is 2/2, full count 3",
    (lang) => {
      const questions = questionsFor(lang);
      const answers = correctAnswersFor(lang);
      // Content-derived correct options match the reviewed result.
      expect(answers[TRUE_FALSE_QUESTION_KEY]).toEqual(["fd0b08315c86"]);
      expect(answers[SINGLE_CHOICE_QUESTION_KEY]).toEqual(["ca4d4664940e"]);
      expect(summarizeKnowledge(questions, answers)).toEqual({
        correct: 2,
        total: 2,
      });
      expect(questions).toHaveLength(3);
      expect(hasNeutralQuestion(questions)).toBe(true);
      // An attempt with a neutral question saves no score.
      expect(scoreToSave(questions, answers)).toBeNull();
    },
  );

  test("wrong knowledge answers lower only the knowledge numerator", () => {
    const questions = questionsFor("en");
    const good = correctAnswersFor("en");
    const wrongTrueFalse = {
      ...good,
      [TRUE_FALSE_QUESTION_KEY]: ["not-an-option"],
    };
    expect(summarizeKnowledge(questions, wrongTrueFalse)).toEqual({
      correct: 1,
      total: 2,
    });
    const bothWrong = { ...wrongTrueFalse, [SINGLE_CHOICE_QUESTION_KEY]: [] };
    expect(summarizeKnowledge(questions, bothWrong)).toEqual({
      correct: 0,
      total: 2,
    });
    expect(summarizeKnowledge(questions, {})).toEqual({ correct: 0, total: 2 });
  });

  test("reflection-only, knowledge-only and empty sets", () => {
    const reflectionOnly = [questionsFor("en")[2]];
    expect(
      summarizeKnowledge(reflectionOnly, {
        [REFLECTION_QUESTION_KEY]: ["5c922d162909"],
      }),
    ).toEqual({ correct: 0, total: 0 });
    expect(scoreToSave(reflectionOnly, {})).toBeNull();

    const knowledgeOnly = questionsFor("en").slice(0, 2);
    const answers = correctAnswersFor("en");
    expect(summarizeKnowledge(knowledgeOnly, answers)).toEqual({
      correct: 2,
      total: 2,
    });
    // Unchanged for knowledge-only content: a numeric score is saved.
    expect(scoreToSave(knowledgeOnly, answers)).toBe(2);
    expect(hasNeutralQuestion(knowledgeOnly)).toBe(false);

    expect(summarizeKnowledge([], {})).toEqual({ correct: 0, total: 0 });
    expect(scoreToSave([], {})).toBe(0);
  });

  test("one knowledge question, one confidence reflection, one long answer: denominator 1", () => {
    const questions = [
      makeQuestion("k", "multiple_choice_single", {
        options: [option("a", true), option("b", false)],
      }),
      makeQuestion("c", "multiple_choice_multiple", {
        gradingMode: "reflection",
        options: [option("lo", false), option("hi", false)],
      }),
      makeQuestion("l", "long_answer"),
    ];
    const answers = { k: ["a"], c: ["hi"], l: ["my reflection"] };
    expect(summarizeKnowledge(questions, answers)).toEqual({
      correct: 1,
      total: 1,
    });
    expect(scoreToSave(questions, answers)).toBeNull();
    expect(questions).toHaveLength(3);
  });
});

describe("saved score display", () => {
  const questions = questionsFor("en");
  const answers = correctAnswersFor("en");
  const legacy = {
    isCompleted: true,
    score: 2,
    totalQuestions: 3,
    answers,
  };

  test("a completed legacy 2/3 with current complete answers shows 2/2", () => {
    const expected = { correct: 2, total: 2, percent: 100 };
    expect(displayKnowledgeScore(questions, legacy)).toEqual(expected);
    // The same result when the new client saved a null score.
    expect(displayKnowledgeScore(questions, { ...legacy, score: null })).toEqual(
      expected,
    );
  });

  test("a saved aggregate is not trusted for a set with a reflection", () => {
    const wrongOption = questions[0].options?.find((option) => !option.is_correct);
    expect(wrongOption).toBeDefined();
    const wrong = { ...answers, [TRUE_FALSE_QUESTION_KEY]: [wrongOption?._key ?? ""] };
    expect(
      displayKnowledgeScore(questions, { ...legacy, answers: wrong }),
    ).toEqual({ correct: 1, total: 2, percent: 50 });
    // A stored 3/3 must not leak through.
    expect(
      displayKnowledgeScore(questions, { ...legacy, score: 3, answers: wrong })
        ?.correct,
    ).toBe(1);
  });

  test.each([
    [TRUE_FALSE_QUESTION_KEY, ["removed-option"]],
    [SINGLE_CHOICE_QUESTION_KEY, ["removed-option"]],
    [REFLECTION_QUESTION_KEY, ["removed-option"]],
    [REFLECTION_QUESTION_KEY, ["5c922d162909", "5c922d162909"]],
  ])("stale or duplicate saved choices hide the score: %s %j", (key, answer) => {
    expect(displayKnowledgeScore(questions, {
      ...legacy,
      answers: {...answers, [key]: answer},
    })).toBeNull();
  });

  test("saved matching answers must use current pairs and values", () => {
    const matching = makeQuestion("matching", "matching", {
      matching_pairs: [
        {_key: "p1", left_item: "L1", right_item: "R1"},
        {_key: "p2", left_item: "L2", right_item: "R2"},
      ],
    });
    const mixed = [matching, questions[2]];
    const show = (answer: string[]) => displayKnowledgeScore(mixed, {
      ...legacy,
      totalQuestions: 2,
      answers: {[matching._key]: answer, [REFLECTION_QUESTION_KEY]: answers[REFLECTION_QUESTION_KEY]},
    });
    expect(show(["p1::R1", "p2::R2"])).toEqual({correct: 1, total: 1, percent: 100});
    expect(show(["p1::R1", "p2::R1"])).toEqual({correct: 0, total: 1, percent: 0});
    expect(show(["p1::R1", "p2::removed-value"])).toBeNull();
    expect(show(["p1::R1", "removed-pair::R2"])).toBeNull();
    expect(show(["p1::R1", "p2::R2", "p3::R1"])).toBeNull();
  });

  test("saved single choices and free text keep their answer shape", () => {
    const allChoices = questions[0].options?.map((option) => option._key) ?? [];
    expect(displayKnowledgeScore(questions, {
      ...legacy,
      answers: {...answers, [TRUE_FALSE_QUESTION_KEY]: allChoices},
    })).toBeNull();
    const freeText = makeQuestion("text", "short_answer", {
      correct_answer: {value: ["yes"]},
    });
    const mixed = [freeText, questions[2]];
    const show = (answer: string[]) => displayKnowledgeScore(mixed, {
      ...legacy,
      totalQuestions: 2,
      answers: {[freeText._key]: answer, [REFLECTION_QUESTION_KEY]: answers[REFLECTION_QUESTION_KEY]},
    });
    expect(show(["yes"])).toEqual({correct: 1, total: 1, percent: 100});
    expect(show(["no"])).toEqual({correct: 0, total: 1, percent: 0});
    expect(show(["yes", "stale extra value"])).toBeNull();
  });

  test("incomplete or unknown evidence shows no number", () => {
    const { [REFLECTION_QUESTION_KEY]: dropReflection, ...noReflection } =
      answers;
    const { [TRUE_FALSE_QUESTION_KEY]: dropKnowledge, ...noKnowledge } =
      answers;
    expect(dropReflection).toBeDefined();
    expect(dropKnowledge).toBeDefined();
    const show = (over: Partial<typeof legacy>) =>
      displayKnowledgeScore(questions, { ...legacy, ...over });
    expect(show({ answers: noReflection })).toBeNull();
    expect(show({ answers: noKnowledge })).toBeNull();
    expect(show({ answers: {} })).toBeNull();
    expect(show({ isCompleted: false })).toBeNull();
    // Content changed since the attempt: the stored total is not the current count.
    expect(show({ totalQuestions: 4 })).toBeNull();
    expect(displayKnowledgeScore(undefined, legacy)).toBeNull();
    expect(displayKnowledgeScore(null, legacy)).toBeNull();
    expect(displayKnowledgeScore([], legacy)).toBeNull();
    expect(displayKnowledgeScore(questions, null)).toBeNull();
    expect(displayKnowledgeScore(questions, undefined)).toBeNull();
  });

  test("reflection-only content shows no number, whatever was saved", () => {
    const reflectionOnly = [questions[2]];
    for (const score of [0, 1, null]) {
      expect(
        displayKnowledgeScore(reflectionOnly, {
          isCompleted: true,
          score,
          totalQuestions: 1,
          answers: { [REFLECTION_QUESTION_KEY]: ["5c922d162909"] },
        }),
      ).toBeNull();
    }
  });

  test("knowledge-only content keeps the saved score and total", () => {
    const knowledgeOnly = questions.slice(0, 2);
    const progress = { isCompleted: true, answers: {} };
    expect(
      displayKnowledgeScore(knowledgeOnly, {
        ...progress,
        score: 2,
        totalQuestions: 3,
      }),
    ).toEqual({ correct: 2, total: 3, percent: 67 });
    expect(
      displayKnowledgeScore(knowledgeOnly, {
        ...progress,
        score: null,
        totalQuestions: 2,
      }),
    ).toBeNull();
    expect(
      displayKnowledgeScore(knowledgeOnly, {
        ...progress,
        score: 0,
        totalQuestions: 2,
      }),
    ).toEqual({ correct: 0, total: 2, percent: 0 });
  });
});

describe("question status for the breakdown", () => {
  const questions = questionsFor("en");
  const answers = correctAnswersFor("en");
  const [trueFalse, single, reflection] = questions;

  test("unanswered, draft, neutral and knowledge outcomes are distinct", () => {
    expect(questionStatus(trueFalse, undefined, true)).toBe("unanswered");
    expect(questionStatus(trueFalse, answers[trueFalse._key], false)).toBe(
      "draft",
    );
    expect(questionStatus(reflection, answers[reflection._key], false)).toBe(
      "draft",
    );
    expect(questionStatus(trueFalse, answers[trueFalse._key], true)).toBe(
      "correct",
    );
    expect(questionStatus(single, ["not-an-option"], true)).toBe("incorrect");
    expect(questionStatus(reflection, answers[reflection._key], true)).toBe(
      "neutral",
    );
    expect(
      questionStatus(makeQuestion("l", "long_answer"), ["words"], true),
    ).toBe("neutral");
  });

  test("submitted follows the quiz resume rule", () => {
    const base = {
      isCompleted: false,
      currentQuestionIndex: 1,
      currentSubmitted: false,
    };
    expect(wasSubmitted(0, base)).toBe(true);
    expect(wasSubmitted(1, base)).toBe(false);
    expect(wasSubmitted(1, { ...base, currentSubmitted: true })).toBe(true);
    expect(wasSubmitted(2, { ...base, currentSubmitted: true })).toBe(false);
    expect(wasSubmitted(2, { ...base, isCompleted: true })).toBe(true);
    expect(wasSubmitted(0, null)).toBe(false);
  });
});

describe("fixture helpers", () => {
  test("correctOptionKeys reads the is_correct flags", () => {
    const q = makeQuestion("x", "multiple_choice_single", {
      options: [option("a", false), option("b", true)],
    });
    expect(correctOptionKeys(q)).toEqual(["b"]);
  });
});
