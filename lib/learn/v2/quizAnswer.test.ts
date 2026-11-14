import { describe, expect, it } from "vitest";
import type { SanityQuizQuestion } from "@/types";
import {
  fromStoredAnswer,
  gradeQuizAnswer,
  isTextAnswerQuestion,
  toStoredAnswer,
} from "./quizAnswer";

const q = (over: Partial<SanityQuizQuestion>): SanityQuizQuestion =>
  ({
    _key: "q1",
    question_type: "multiple_choice_single",
    question_text: [],
    order_number: 1,
    ...over,
  }) as SanityQuizQuestion;

const single = q({
  question_type: "multiple_choice_single",
  options: [
    { _key: "a", is_correct: true },
    { _key: "b", is_correct: false },
  ] as SanityQuizQuestion["options"],
});
const multiple = q({
  question_type: "multiple_choice_multiple",
  options: [
    { _key: "a", is_correct: true },
    { _key: "b", is_correct: true },
    { _key: "c", is_correct: false },
  ] as SanityQuizQuestion["options"],
});
const text = q({
  question_type: "short_answer",
  correct_answer: { value: ["$1,200"] },
});
const matching = q({ question_type: "matching" });

describe("stored answer format (mobile user_quiz_responses.user_answer)", () => {
  it("stores single choice as the option key, multiple as an array, text as a string", () => {
    expect(toStoredAnswer(single, ["a"])).toBe("a");
    expect(toStoredAnswer(multiple, ["a", "b"])).toEqual(["a", "b"]);
    expect(toStoredAnswer(text, ["1200"])).toBe("1200");
  });

  it("stores nothing for matching or an empty answer, as mobile", () => {
    expect(toStoredAnswer(matching, ["p1::x"])).toBeUndefined();
    expect(toStoredAnswer(single, [])).toBeUndefined();
    expect(toStoredAnswer(single, undefined)).toBeUndefined();
  });

  it("reads mobile's stored values back into web's string[] form", () => {
    expect(fromStoredAnswer(single, "a")).toEqual(["a"]);
    expect(fromStoredAnswer(multiple, ["a", "b"])).toEqual(["a", "b"]);
    expect(fromStoredAnswer(text, "hello")).toEqual(["hello"]);
    expect(fromStoredAnswer(matching, ["x"])).toBeUndefined();
    expect(fromStoredAnswer(single, null)).toBeUndefined();
  });
});

describe("gradeQuizAnswer (copied from mobile)", () => {
  it("grades single choice by the option flag", () => {
    expect(gradeQuizAnswer(single, "a")).toBe(true);
    expect(gradeQuizAnswer(single, "b")).toBe(false);
  });

  it("needs exactly the correct set for multiple choice", () => {
    expect(gradeQuizAnswer(multiple, ["b", "a"])).toBe(true);
    expect(gradeQuizAnswer(multiple, ["a"])).toBe(false);
    expect(gradeQuizAnswer(multiple, ["a", "b", "c"])).toBe(false);
  });

  it("normalizes text and numbers like mobile", () => {
    expect(isTextAnswerQuestion("short_answer")).toBe(true);
    expect(gradeQuizAnswer(text, " 1200 ")).toBe(true);
    expect(gradeQuizAnswer(text, "$1,200.0")).toBe(true);
    expect(gradeQuizAnswer(text, "")).toBe(false);
  });
});
