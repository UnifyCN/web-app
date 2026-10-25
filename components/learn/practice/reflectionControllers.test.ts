import { beforeEach, describe, expect, test, vi } from "vitest";
import type {
  PracticeFeedbackInput,
  UpsertLessonQuizProgressInput,
  UpsertPracticeProgressInput,
} from "@/services/learn";
import type {
  LessonQuizProgress,
  PracticeProgress,
  SanityQuizQuestion,
} from "@/types";
import { LessonQuiz } from "./LessonQuiz";
import { PracticeQuiz, type FlatQuestion } from "./PracticeQuiz";
import { QuizProgressBar } from "./QuizProgressBar";
import { QuizQuestion } from "./QuizQuestion";
import { QuizResults } from "./QuizResults";
import { TakeABreakModal } from "./TakeABreakModal";
import {
  Harness,
  type Screen,
  buttonLabelled,
  buttonLabels,
  call,
  disabled,
  has,
  only,
} from "./testing/hookHarness";
import {
  CONFIDENCE_OPTION_KEYS,
  REFLECTION_QUESTION_KEY,
  SECTION_ID,
  SINGLE_CHOICE_QUESTION_KEY,
  TRUE_FALSE_QUESTION_KEY,
  block,
  correctAnswersFor,
  flatFor,
  makeQuestion,
  option,
  questionByKey,
  questionsFor,
} from "./testing/reflectionFixtures";

/*
 * These tests run the real PracticeQuiz and LessonQuiz controller functions in
 * the local hook harness (testing/hookHarness.ts). The harness returns the
 * element tree the controller built; the tests call the handlers the controller
 * passed to its buttons and children, and read the payloads it sent to the
 * progress mutations. Child components are not expanded here: their markup is
 * covered in reflectionRender.test.ts. Nothing here touches a DOM, a browser,
 * React Query or Supabase.
 */

const mocks = vi.hoisted(() => ({
  upsert: vi.fn<(input: UpsertPracticeProgressInput) => void>(),
  feedback: vi.fn<(input: PracticeFeedbackInput, options: unknown) => void>(),
  lessonMutate: vi.fn<(input: UpsertLessonQuizProgressInput) => void>(),
  lessonMutateAsync:
    vi.fn<(input: UpsertLessonQuizProgressInput) => Promise<void>>(),
  push: vi.fn<(href: string) => void>(),
  track: vi.fn<(input: unknown) => void>(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const harness = await import("./testing/hookHarness");
  return {
    ...actual,
    useState: harness.useState,
    useRef: harness.useRef,
    useEffect: harness.useEffect,
    useMemo: harness.useMemo,
    useCallback: harness.useCallback,
  };
});
vi.mock("react-i18next", async () => {
  const { createInstance } = await import("i18next");
  const { default: en } = await import("@/lib/i18n/locales/en/translation.json");
  const instance = createInstance();
  void instance.init({
    lng: "en",
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
    initImmediate: false,
  });
  return {
    useTranslation: () => ({ t: instance.t.bind(instance), i18n: instance }),
  };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/hooks/useLearn", () => ({
  useUpsertPracticeProgress: () => ({ mutate: mocks.upsert, isPending: false }),
  usePracticeFeedback: () => ({ mutate: mocks.feedback }),
  useUpsertLessonQuizProgress: () => ({
    mutate: mocks.lessonMutate,
    mutateAsync: mocks.lessonMutateAsync,
    isPending: false,
  }),
}));
vi.mock("@/lib/analytics", () => ({ trackQuizCompleted: mocks.track }));

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
});

const TF = TRUE_FALSE_QUESTION_KEY;
const SINGLE = SINGLE_CHOICE_QUESTION_KEY;
const REFLECTION = REFLECTION_QUESTION_KEY;
const PICK = CONFIDENCE_OPTION_KEYS[0];
const GOOD = correctAnswersFor("en");
const SECTION_HREF = `/learn/m1/${SECTION_ID}`;

/* ---- PracticeQuiz --------------------------------------------------------- */

type PracticeProps = Parameters<typeof PracticeQuiz>[0];

function practice(
  over: Partial<PracticeProps> = {},
): Harness<PracticeProps> {
  return new Harness(PracticeQuiz, {
    moduleId: "m1",
    submoduleId: SECTION_ID,
    sectionNumber: 1,
    submoduleTitle: "Your responsibilities",
    colorHex: "#f68b26",
    questions: flatFor("en"),
    initialProgress: null,
    ...over,
  });
}

function saved(over: Partial<PracticeProgress> = {}): PracticeProgress {
  return {
    submoduleId: SECTION_ID,
    currentQuestionIndex: 0,
    currentSubmitted: false,
    answers: {},
    isCompleted: false,
    score: null,
    totalQuestions: null,
    updatedAt: "2026-10-25T00:00:00Z",
    ...over,
  };
}

/** Props of the question child the controller currently shows. */
function shown(h: Screen) {
  const el = only(h.tree, QuizQuestion);
  const question = el.props.question as SanityQuizQuestion;
  return {
    key: question._key,
    answer: el.props.answer as string[],
    submitted: el.props.submitted as boolean,
  };
}

function choose(h: Screen, selection: string[]) {
  h.act(() => call(only(h.tree, QuizQuestion), "onChange", selection));
}

function press(h: Screen, label: string) {
  h.act(() => call(buttonLabelled(h.tree, label), "onClick"));
}

function writes() {
  return mocks.upsert.mock.calls.map(([input]) => input);
}

/** Answer and submit the current question, then move on. */
function answerAndAdvance(h: Screen, selection: string[]) {
  choose(h, selection);
  press(h, "Submit");
  press(h, "Next");
}

describe("PracticeQuiz with the real confidence check", () => {
  test.each([
    {label: "missing knowledge answer", answers: {...GOOD, [TF]: []}, totalQuestions: 3},
    {label: "stale knowledge choice", answers: {...GOOD, [TF]: ["removed-option"]}, totalQuestions: 3},
    {label: "missing reflection answer", answers: {...GOOD, [REFLECTION]: []}, totalQuestions: 3},
    {label: "changed question count", answers: GOOD, totalQuestions: 4},
  ])("restored results hide an unsafe score: $label", ({answers, totalQuestions}) => {
    const h = practice({initialProgress: saved({
      isCompleted: true,
      currentQuestionIndex: 2,
      currentSubmitted: true,
      score: 2,
      answers,
      totalQuestions,
    })});
    const results = only(h.tree, QuizResults);
    expect(results.props.knowledge).toBeNull();
    expect(results.props.includesReflection).toBe(true);
    expect(mocks.upsert).not.toHaveBeenCalled();
    h.act(() => call(results, "onRetake"));
    expect(has(h.tree, QuizResults)).toBe(false);
    answerAndAdvance(h, GOOD[TF]);
    answerAndAdvance(h, GOOD[SINGLE]);
    choose(h, [PICK]);
    press(h, "Submit");
    press(h, "Done");
    expect(only(h.tree, QuizResults).props.knowledge).toEqual({correct: 2, total: 2});
  });

  test("Submit, Next, Back, Done: payloads keep the full count, keys and indexes", () => {
    const h = practice();
    expect(shown(h)).toEqual({ key: TF, answer: [], submitted: false });
    // Nothing to submit until the question is answered.
    expect(disabled(buttonLabelled(h.tree, "Submit"))).toBe(true);

    choose(h, GOOD[TF]);
    press(h, "Submit");
    expect(writes().at(-1)).toEqual({
      submoduleId: SECTION_ID,
      moduleId: "m1",
      currentQuestionIndex: 0,
      currentSubmitted: true,
      answers: { [TF]: GOOD[TF] },
      isCompleted: false,
      score: null,
      totalQuestions: 3,
    });
    expect(shown(h).submitted).toBe(true);

    press(h, "Next");
    expect(shown(h).key).toBe(SINGLE);
    expect(writes().at(-1)).toMatchObject({
      currentQuestionIndex: 1,
      currentSubmitted: false,
      isCompleted: false,
      score: null,
      totalQuestions: 3,
    });

    // Back keeps the earlier answer and its lock, and writes nothing.
    const before = writes().length;
    press(h, "Back");
    expect(shown(h)).toEqual({ key: TF, answer: GOOD[TF], submitted: true });
    expect(writes()).toHaveLength(before);
    press(h, "Next");
    expect(shown(h).key).toBe(SINGLE);

    choose(h, GOOD[SINGLE]);
    press(h, "Submit");
    press(h, "Next");
    expect(shown(h)).toEqual({ key: REFLECTION, answer: [], submitted: false });
    expect(writes().at(-1)).toMatchObject({
      currentQuestionIndex: 2,
      currentSubmitted: false,
      totalQuestions: 3,
    });

    // The reflection is question 3, index 2, and any selection can be submitted.
    choose(h, [PICK, CONFIDENCE_OPTION_KEYS[2]]);
    expect(disabled(buttonLabelled(h.tree, "Submit"))).toBe(false);
    press(h, "Submit");
    expect(writes().at(-1)).toEqual({
      submoduleId: SECTION_ID,
      moduleId: "m1",
      currentQuestionIndex: 2,
      currentSubmitted: true,
      answers: {
        [TF]: GOOD[TF],
        [SINGLE]: GOOD[SINGLE],
        [REFLECTION]: [PICK, CONFIDENCE_OPTION_KEYS[2]],
      },
      isCompleted: false,
      score: null,
      totalQuestions: 3,
    });
    expect(buttonLabels(h.tree)).toContain("Done");

    // Done saves a null score with the full count, and shows a 2/2 knowledge result.
    press(h, "Done");
    expect(writes().at(-1)).toEqual({
      submoduleId: SECTION_ID,
      moduleId: "m1",
      currentQuestionIndex: 2,
      currentSubmitted: true,
      answers: {
        [TF]: GOOD[TF],
        [SINGLE]: GOOD[SINGLE],
        [REFLECTION]: [PICK, CONFIDENCE_OPTION_KEYS[2]],
      },
      isCompleted: true,
      score: null,
      totalQuestions: 3,
    });
    const results = only(h.tree, QuizResults);
    expect(results.props.knowledge).toEqual({ correct: 2, total: 2 });
    expect(results.props.includesReflection).toBe(true);
    expect(mocks.feedback).not.toHaveBeenCalled();
  });

  test("a wrong knowledge answer lowers only the knowledge result", () => {
    const h = practice();
    answerAndAdvance(h, ["not-an-option"]);
    answerAndAdvance(h, GOOD[SINGLE]);
    choose(h, [PICK]);
    press(h, "Submit");
    press(h, "Done");
    const results = only(h.tree, QuizResults);
    expect(results.props.knowledge).toEqual({ correct: 1, total: 2 });
    expect(writes().at(-1)).toMatchObject({
      isCompleted: true,
      score: null,
      totalQuestions: 3,
    });
  });

  test("Save and leave writes the draft reflection and goes to the section", () => {
    const h = practice();
    answerAndAdvance(h, GOOD[TF]);
    answerAndAdvance(h, GOOD[SINGLE]);
    choose(h, [PICK]); // typed, not submitted
    h.act(() => call(only(h.tree, QuizProgressBar), "onClose"));
    h.act(() => call(only(h.tree, TakeABreakModal), "onSaveAndLeave"));
    expect(writes().at(-1)).toEqual({
      submoduleId: SECTION_ID,
      moduleId: "m1",
      currentQuestionIndex: 2,
      currentSubmitted: false,
      answers: { [TF]: GOOD[TF], [SINGLE]: GOOD[SINGLE], [REFLECTION]: [PICK] },
      isCompleted: false,
      score: null,
      totalQuestions: 3,
    });
    expect(mocks.push).toHaveBeenCalledWith(SECTION_HREF);
  });

  test("resume before Submit restores the selection, unlocked, with no grade", () => {
    const h = practice({
      initialProgress: saved({
        currentQuestionIndex: 2,
        currentSubmitted: false,
        answers: { ...GOOD, [REFLECTION]: [PICK] },
      }),
    });
    expect(shown(h)).toEqual({ key: REFLECTION, answer: [PICK], submitted: false });
    expect(buttonLabels(h.tree)).toContain("Submit");
    expect(has(h.tree, QuizResults)).toBe(false);
    // Earlier answered questions come back locked.
    press(h, "Back");
    expect(shown(h)).toEqual({ key: SINGLE, answer: GOOD[SINGLE], submitted: true });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  test("resume after Submit restores the selection locked, and Done completes", () => {
    const h = practice({
      initialProgress: saved({
        currentQuestionIndex: 2,
        currentSubmitted: true,
        answers: { ...GOOD, [REFLECTION]: [PICK] },
      }),
    });
    expect(shown(h)).toEqual({ key: REFLECTION, answer: [PICK], submitted: true });
    // A locked question ignores further changes.
    choose(h, [CONFIDENCE_OPTION_KEYS[1]]);
    expect(shown(h).answer).toEqual([PICK]);
    expect(buttonLabels(h.tree)).toContain("Done");
    press(h, "Done");
    expect(writes().at(-1)).toMatchObject({
      isCompleted: true,
      score: null,
      totalQuestions: 3,
      answers: { ...GOOD, [REFLECTION]: [PICK] },
    });
    expect(only(h.tree, QuizResults).props.knowledge).toEqual({
      correct: 2,
      total: 2,
    });
  });

  test("a completed attempt reopens on the 2/2 knowledge result", () => {
    const h = practice({
      initialProgress: saved({
        currentQuestionIndex: 2,
        currentSubmitted: true,
        isCompleted: true,
        score: 2, // legacy row: knowledge count over a full-count total
        totalQuestions: 3,
        answers: { ...GOOD, [REFLECTION]: [PICK] },
      }),
    });
    const results = only(h.tree, QuizResults);
    expect(results.props.knowledge).toEqual({ correct: 2, total: 2 });
    expect(results.props.includesReflection).toBe(true);
  });

  test("Retake clears the attempt and saves a null score with the full count", () => {
    const h = practice({
      initialProgress: saved({
        currentQuestionIndex: 2,
        currentSubmitted: true,
        isCompleted: true,
        answers: { ...GOOD, [REFLECTION]: [PICK] },
      }),
    });
    h.act(() => call(only(h.tree, QuizResults), "onRetake"));
    expect(writes().at(-1)).toEqual({
      submoduleId: SECTION_ID,
      moduleId: "m1",
      currentQuestionIndex: 0,
      currentSubmitted: false,
      answers: {},
      isCompleted: false,
      score: null,
      totalQuestions: 3,
    });
    expect(shown(h)).toEqual({ key: TF, answer: [], submitted: false });
  });

  test("a knowledge-only quiz still saves its numeric score", () => {
    const questions: FlatQuestion[] = flatFor("en").slice(0, 2);
    const h = practice({ questions });
    answerAndAdvance(h, GOOD[TF]);
    choose(h, GOOD[SINGLE]);
    press(h, "Submit");
    press(h, "Done");
    expect(writes().at(-1)).toMatchObject({
      isCompleted: true,
      score: 2,
      totalQuestions: 2,
    });
    const results = only(h.tree, QuizResults);
    expect(results.props.knowledge).toEqual({ correct: 2, total: 2 });
    expect(results.props.includesReflection).toBe(false);
  });

  test("a reflection-only quiz completes with a null score and an empty knowledge result", () => {
    const h = practice({ questions: flatFor("en").slice(2) });
    expect(shown(h).key).toBe(REFLECTION);
    choose(h, [PICK]);
    press(h, "Submit");
    press(h, "Done");
    expect(writes().at(-1)).toMatchObject({
      isCompleted: true,
      score: null,
      totalQuestions: 1,
      currentQuestionIndex: 0,
    });
    expect(only(h.tree, QuizResults).props.knowledge).toEqual({
      correct: 0,
      total: 0,
    });
  });
});

describe("PracticeQuiz coach feedback", () => {
  const flat = (...questions: SanityQuizQuestion[]): FlatQuestion[] =>
    questions.map((question) => ({ question, practiceTitle: "Practice" }));

  function submitText(question: SanityQuizQuestion, text: string) {
    const h = practice({ questions: flat(question) });
    choose(h, [text]);
    press(h, "Submit");
    return h;
  }

  test.each(["short_answer", "fill_blank"] as const)(
    "a knowledge %s answer still requests coach feedback",
    (type) => {
      submitText(
        makeQuestion("k", type, {
          question_text: [block("Name the card.")],
          correct_answer: { value: ["PR card"] },
        }),
        "my answer",
      );
      expect(mocks.feedback).toHaveBeenCalledTimes(1);
      expect(mocks.feedback.mock.calls[0][0]).toEqual({
        questionText: "Name the card.",
        userAnswer: "my answer",
        expectedAnswer: "PR card",
        practiceTitle: "Practice",
      });
    },
  );

  test("a legacy long_answer does not request coach feedback, but is saved", () => {
    const h = submitText(
      makeQuestion("l", "long_answer", { question_text: [block("Reflect.")] }),
      "my reflection",
    );
    expect(mocks.feedback).not.toHaveBeenCalled();
    expect(writes().at(-1)).toMatchObject({
      currentSubmitted: true,
      answers: { l: ["my reflection"] },
    });
    expect(shown(h).submitted).toBe(true);
  });

  test("a free-text question marked as a reflection does not request coach feedback", () => {
    submitText(
      makeQuestion("r", "short_answer", {
        gradingMode: "reflection",
        question_text: [block("How did it go?")],
      }),
      "fine",
    );
    expect(mocks.feedback).not.toHaveBeenCalled();
  });

  test("the confidence check does not request coach feedback", () => {
    const h = practice({ questions: flatFor("en").slice(2) });
    choose(h, [PICK]);
    press(h, "Submit");
    expect(mocks.feedback).not.toHaveBeenCalled();
  });
});

/* ---- LessonQuiz ----------------------------------------------------------- */

type LessonProps = Parameters<typeof LessonQuiz>[0];

/** A lesson Quick Check: one knowledge question and the confidence check. */
function lessonQuestions(): SanityQuizQuestion[] {
  const all = questionsFor("en");
  return [questionByKey(all, SINGLE), questionByKey(all, REFLECTION)];
}

function lesson(over: Partial<LessonProps> = {}) {
  const onLessonComplete = vi.fn<() => void>();
  const h = new Harness(LessonQuiz, {
    lessonId: "lesson-1",
    moduleId: "m1",
    submoduleId: SECTION_ID,
    title: "Quick check",
    questions: lessonQuestions(),
    colorHex: "#f68b26",
    onLessonComplete,
    sectionHref: SECTION_HREF,
    initialProgress: null,
    ...over,
  });
  return { h, onLessonComplete };
}

function lessonSaved(over: Partial<LessonQuizProgress> = {}): LessonQuizProgress {
  return {
    lessonId: "lesson-1",
    answers: {},
    currentQuestionIndex: 0,
    currentSubmitted: false,
    isCompleted: false,
    score: null,
    totalQuestions: null,
    updatedAt: "2026-10-25T00:00:00Z",
    ...over,
  };
}

function lessonWrites() {
  return mocks.lessonMutate.mock.calls.map(([input]) => input);
}

describe("LessonQuiz with a reflection", () => {
  test("Submit and Next write the full count and a null score until the end", () => {
    const { h } = lesson();
    expect(shown(h).key).toBe(SINGLE);
    choose(h, GOOD[SINGLE]);
    press(h, "Submit");
    expect(lessonWrites().at(-1)).toEqual({
      lessonId: "lesson-1",
      answers: { [SINGLE]: GOOD[SINGLE] },
      currentQuestionIndex: 0,
      currentSubmitted: true,
      isCompleted: false,
      score: null,
      totalQuestions: 2,
    });
    press(h, "Next");
    expect(shown(h).key).toBe(REFLECTION);
    expect(lessonWrites().at(-1)).toMatchObject({
      currentQuestionIndex: 1,
      currentSubmitted: false,
      isCompleted: false,
      score: null,
      totalQuestions: 2,
    });
    // Back keeps the earlier answer and lock.
    press(h, "Back");
    expect(shown(h)).toEqual({ key: SINGLE, answer: GOOD[SINGLE], submitted: true });
  });

  test("Done saves a null score and the full count, then completes the lesson in order", async () => {
    const events: string[] = [];
    const { h, onLessonComplete } = lesson();
    onLessonComplete.mockImplementation(() => void events.push("complete"));
    mocks.track.mockImplementation(() => void events.push("track"));
    mocks.push.mockImplementation(() => void events.push("push"));
    let release: () => void = () => undefined;
    mocks.lessonMutateAsync.mockImplementation(() => {
      events.push("save");
      return new Promise<void>((resolve) => {
        release = resolve;
      });
    });

    answerAndAdvance(h, GOOD[SINGLE]);
    choose(h, [PICK]);
    press(h, "Submit");

    const finishing = h.actAsync(() =>
      call(buttonLabelled(h.tree, "Done"), "onClick"),
    );
    // The save is in flight: nothing downstream has happened yet.
    expect(mocks.lessonMutateAsync).toHaveBeenCalledTimes(1);
    expect(mocks.lessonMutateAsync.mock.calls[0][0]).toEqual({
      lessonId: "lesson-1",
      answers: { [SINGLE]: GOOD[SINGLE], [REFLECTION]: [PICK] },
      currentQuestionIndex: 1,
      currentSubmitted: true,
      isCompleted: true,
      score: null,
      totalQuestions: 2,
    });
    expect(events).toEqual(["save"]);
    expect(onLessonComplete).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();

    release();
    await finishing;
    expect(events).toEqual(["save", "track", "complete", "push"]);
    expect(mocks.track).toHaveBeenCalledWith({
      lessonId: "lesson-1",
      submoduleId: SECTION_ID,
      moduleId: "m1",
      quizTitle: "Quick check",
    });
    expect(mocks.push).toHaveBeenCalledWith(SECTION_HREF);
  });

  test("a failed final save keeps the learner on the quiz and does not complete the lesson", async () => {
    const { h, onLessonComplete } = lesson();
    mocks.lessonMutateAsync.mockRejectedValue(new Error("network"));
    answerAndAdvance(h, GOOD[SINGLE]);
    choose(h, [PICK]);
    press(h, "Submit");

    await h.actAsync(() => call(buttonLabelled(h.tree, "Done"), "onClick"));

    expect(mocks.lessonMutateAsync).toHaveBeenCalledTimes(1);
    expect(onLessonComplete).not.toHaveBeenCalled();
    expect(mocks.track).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
    // Still on the reflection, selection kept and locked, ready to retry.
    expect(shown(h)).toEqual({ key: REFLECTION, answer: [PICK], submitted: true });
    expect(buttonLabels(h.tree)).toContain("Done");

    // A retry after the failure goes through the same path.
    mocks.lessonMutateAsync.mockResolvedValue(undefined);
    await h.actAsync(() => call(buttonLabelled(h.tree, "Done"), "onClick"));
    expect(mocks.lessonMutateAsync).toHaveBeenCalledTimes(2);
    expect(onLessonComplete).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledWith(SECTION_HREF);
  });

  test("remount before Submit restores the selection unlocked; after Submit, locked", () => {
    const answers = { [SINGLE]: GOOD[SINGLE], [REFLECTION]: [PICK] };
    const before = lesson({
      initialProgress: lessonSaved({
        answers,
        currentQuestionIndex: 1,
        currentSubmitted: false,
      }),
    }).h;
    expect(shown(before)).toEqual({ key: REFLECTION, answer: [PICK], submitted: false });
    expect(buttonLabels(before.tree)).toContain("Submit");

    const after = lesson({
      initialProgress: lessonSaved({
        answers,
        currentQuestionIndex: 1,
        currentSubmitted: true,
      }),
    }).h;
    expect(shown(after)).toEqual({ key: REFLECTION, answer: [PICK], submitted: true });
    expect(buttonLabels(after.tree)).toContain("Done");
    expect(mocks.lessonMutate).not.toHaveBeenCalled();
  });

  test("a knowledge-only Quick Check still saves its numeric score", async () => {
    mocks.lessonMutateAsync.mockResolvedValue(undefined);
    const { h, onLessonComplete } = lesson({
      questions: [
        questionByKey(questionsFor("en"), SINGLE),
        makeQuestion("k2", "multiple_choice_single", {
          options: [option("a", true), option("b", false)],
        }),
      ],
    });
    answerAndAdvance(h, GOOD[SINGLE]);
    choose(h, ["a"]);
    press(h, "Submit");
    await h.actAsync(() => call(buttonLabelled(h.tree, "Done"), "onClick"));
    expect(mocks.lessonMutateAsync.mock.calls[0][0]).toMatchObject({
      isCompleted: true,
      score: 2,
      totalQuestions: 2,
    });
    expect(onLessonComplete).toHaveBeenCalledTimes(1);
  });
});
