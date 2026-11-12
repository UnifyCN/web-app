import { describe, expect, it } from "vitest";
import {
  buildCompletion,
  buildPageProgress,
  buildResumePosition,
  completionPercent,
  getLessonTotalPages,
  isResumable,
  lessonResumeHref,
} from "./progress";

const ids = { lessonId: "L", submoduleId: "S", moduleId: "M" };
const now = new Date("2026-11-12T10:00:00.000Z");

describe("getLessonTotalPages", () => {
  it("sums steps, legacy activity and ending pages, and quiz questions", () => {
    expect(
      getLessonTotalPages({
        lesson_page_count: 4,
        activity_page_count: 0,
        ending_page_count: 0,
        quizzes: [
          { _id: "q1", question_count: 3 },
          { _id: "q2", question_count: 2 },
        ],
      }),
    ).toBe(9);
    expect(
      getLessonTotalPages({
        lesson_page_count: 2,
        activity_page_count: 1,
        ending_page_count: 1,
      }),
    ).toBe(4);
  });

  it("ignores missing and bad counts", () => {
    expect(getLessonTotalPages(null)).toBe(0);
    expect(
      getLessonTotalPages({
        lesson_page_count: 3,
        quizzes: [
          { _id: "q", question_count: null },
          { _id: "r", question_count: Number.NaN },
        ],
      }),
    ).toBe(3);
  });
});

describe("progress payloads (same columns and values as mobile)", () => {
  it("Next on a step marks pages 1..N done", () => {
    expect(buildPageProgress(ids, "lesson", 2, 4, now)).toEqual({
      sanity_lesson_id: "L",
      sanity_submodule_id: "S",
      sanity_module_id: "M",
      is_in_progress: true,
      current_page_type: "lesson",
      current_page_number: 2,
      total_pages: 4,
      completed_pages: 2,
      progress_percent: 50,
      last_accessed_at: now.toISOString(),
    });
  });

  it("caps completed pages at the total and rounds the percentage", () => {
    expect(buildPageProgress(ids, "lesson", 9, 3, now)).toMatchObject({
      completed_pages: 3,
      progress_percent: 100,
    });
    expect(buildPageProgress(ids, "lesson", 1, 3, now).progress_percent).toBe(
      33,
    );
    expect(buildPageProgress(ids, "lesson", 1, 0, now).progress_percent).toBe(
      0,
    );
  });

  it("adds the quiz position only when given", () => {
    expect(
      buildPageProgress(ids, "quiz", 5, 6, now, {
        quizId: "qz",
        questionNumber: 2,
      }),
    ).toMatchObject({ current_quiz_id: "qz", current_question_number: 2 });
    expect(buildPageProgress(ids, "lesson", 1, 2, now)).not.toHaveProperty(
      "current_quiz_id",
    );
  });

  it("a resume save never touches the percentage or completion", () => {
    const body = buildResumePosition(ids, "lesson", 3, now);
    expect(body).toEqual({
      sanity_lesson_id: "L",
      sanity_submodule_id: "S",
      sanity_module_id: "M",
      is_in_progress: true,
      current_page_type: "lesson",
      current_page_number: 3,
      last_accessed_at: now.toISOString(),
    });
    expect(body).not.toHaveProperty("is_completed");
    expect(body).not.toHaveProperty("progress_percent");
  });

  it("completion fills every page", () => {
    expect(buildCompletion(ids, 5, now)).toEqual({
      sanity_lesson_id: "L",
      sanity_submodule_id: "S",
      sanity_module_id: "M",
      progress_percent: 100,
      total_pages: 5,
      completed_pages: 5,
      is_completed: true,
      is_in_progress: false,
      completed_at: now.toISOString(),
      last_accessed_at: now.toISOString(),
    });
  });

  it("only writes page types the shared check constraint and old app know", () => {
    for (const type of ["lesson", "quiz"] as const) {
      expect(["intro", "lesson", "activity", "quiz", "ending"]).toContain(
        buildPageProgress(ids, type, 1, 1, now).current_page_type,
      );
    }
  });
});

describe("resume", () => {
  it("is resumable when started and not finished", () => {
    expect(isResumable({ sanity_lesson_id: "L", is_in_progress: true })).toBe(
      true,
    );
    expect(isResumable({ sanity_lesson_id: "L", completed_pages: 1 })).toBe(
      true,
    );
    expect(
      isResumable({
        sanity_lesson_id: "L",
        is_completed: true,
        is_in_progress: true,
      }),
    ).toBe(false);
    expect(isResumable({ sanity_lesson_id: "L" })).toBe(false);
    expect(isResumable(undefined)).toBe(false);
  });

  it("resumes a step, a quiz question, or the module intro", () => {
    expect(
      lessonResumeHref(ids, {
        sanity_lesson_id: "L",
        current_page_type: "lesson",
        current_page_number: 3,
      }),
    ).toBe("/learn/M/S/L?step=3");
    expect(
      lessonResumeHref(ids, {
        sanity_lesson_id: "L",
        current_page_type: "quiz",
        current_quiz_id: "q 1",
        current_question_number: 2,
      }),
    ).toBe("/learn/M/S/L?quiz=q%201&q=2");
    expect(
      lessonResumeHref(ids, {
        sanity_lesson_id: "L",
        current_page_type: "intro",
        current_page_number: 2,
      }),
    ).toBe("/learn/M/S");
    expect(lessonResumeHref(ids, null)).toBe("/learn/M/S/L?step=1");
    expect(
      lessonResumeHref(ids, {
        sanity_lesson_id: "L",
        current_page_type: "lesson",
        current_page_number: -4,
      }),
    ).toBe("/learn/M/S/L?step=1");
  });

  it("maps an old activity or ending position through the block keys", () => {
    const row = {
      sanity_lesson_id: "L",
      current_page_type: "ending",
      current_page_number: 1,
    };
    expect(
      lessonResumeHref(ids, row, (type, page) =>
        type === "ending" && page === 1 ? 4 : undefined,
      ),
    ).toBe("/learn/M/S/L?step=4");
    expect(lessonResumeHref(ids, row, () => undefined)).toBe(
      "/learn/M/S/L?step=1",
    );
  });
});

describe("completionPercent", () => {
  it("is completed lessons over all lessons", () => {
    expect(completionPercent(["a", "b", "c"], new Set(["a"]))).toBe(33);
    expect(completionPercent(["a", "b"], new Set(["a", "b", "z"]))).toBe(100);
    expect(completionPercent([], new Set(["a"]))).toBe(0);
  });
});
