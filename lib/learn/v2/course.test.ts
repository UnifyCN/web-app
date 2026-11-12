import { describe, expect, it } from "vitest";
import { lessonStates, progressSets } from "./course";

describe("progressSets", () => {
  it("splits completed and started lessons", () => {
    const { completed, started } = progressSets([
      { sanity_lesson_id: "a", is_completed: true },
      { sanity_lesson_id: "b", is_in_progress: true },
      { sanity_lesson_id: "c", completed_pages: 2 },
      { sanity_lesson_id: "d" },
    ]);
    expect([...completed]).toEqual(["a"]);
    expect([...started].sort()).toEqual(["a", "b", "c"]);
  });
});

describe("lessonStates", () => {
  it("marks done lessons and the first unfinished one as up next", () => {
    expect(lessonStates(["a", "b", "c"], new Set(["a"]))).toEqual([
      "done",
      "next",
      "todo",
    ]);
    expect(lessonStates(["a", "b", "c"], new Set(["b"]))).toEqual([
      "next",
      "done",
      "todo",
    ]);
    expect(lessonStates(["a", "b"], new Set(["a", "b"]))).toEqual([
      "done",
      "done",
    ]);
    expect(lessonStates([], new Set())).toEqual([]);
  });
});
