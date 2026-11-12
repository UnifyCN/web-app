import { describe, expect, it } from "vitest";
import {
  activityResponseKeys,
  buildActivityInput,
  canSubmitLessonActivity,
  groupActivityInputs,
  isActivityComplete,
  type ActivityItem,
} from "./activity";

const items: ActivityItem[] = [
  { _key: "p", _type: "block", children: [], markDefs: [] },
  {
    _key: "mc",
    _type: "multiple_choice_single",
    options: [
      { _key: "o1", value: "a", is_correct: true },
      { _key: "o2", value: "b" },
    ],
  },
  {
    _key: "match",
    _type: "matching_question",
    matching_pairs: [
      { _key: "p1", left_item: "L1", right_item: "R1" },
      { _key: "p2", left_item: "L2", right_item: "R2" },
    ],
  },
  { _key: "site", _type: "small_input_box", required: true },
  { _key: "note", _type: "large_input_box" },
];

describe("canSubmitLessonActivity", () => {
  it("needs every question answered and required inputs filled", () => {
    expect(canSubmitLessonActivity(items, {}, {})).toBe(false);
    expect(
      canSubmitLessonActivity(
        items,
        { site: "canada.ca" },
        { mc: "a", match: ["p2", "p1"] },
      ),
    ).toBe(true);
    // Optional input may stay empty; required may not be blank.
    expect(
      canSubmitLessonActivity(
        items,
        { site: "  " },
        { mc: "a", match: ["p1", "p2"] },
      ),
    ).toBe(false);
    // Unknown option values and partial matches don't count.
    expect(
      canSubmitLessonActivity(
        items,
        { site: "x" },
        { mc: "z", match: ["p1", "p2"] },
      ),
    ).toBe(false);
    expect(
      canSubmitLessonActivity(items, { site: "x" }, { mc: "a", match: ["p1"] }),
    ).toBe(false);
  });
});

describe("stored answers (mobile user_activity_inputs format)", () => {
  it("lists response keys with the q:: prefix for questions", () => {
    expect(activityResponseKeys(items)).toEqual([
      { key: "q::mc", required: true },
      { key: "q::match", required: true },
      { key: "site", required: true },
      { key: "note", required: false },
    ]);
  });

  it("groups rows by block and decodes question answers", () => {
    const grouped = groupActivityInputs([
      {
        activity_page_key: "act",
        input_field_key: "q::mc",
        input_value: '"a"',
        is_submitted: true,
      },
      {
        activity_page_key: "act",
        input_field_key: "q::match",
        input_value: '["p1","p2"]',
        is_submitted: true,
      },
      {
        activity_page_key: "act",
        input_field_key: "site",
        input_value: "canada.ca",
        is_submitted: true,
      },
      {
        activity_page_key: "act",
        input_field_key: "q::bad",
        input_value: "{oops",
        is_submitted: false,
      },
    ]);
    expect(grouped.act.questionAnswers).toEqual({
      mc: "a",
      match: ["p1", "p2"],
    });
    expect(grouped.act.inputValues).toEqual({ site: "canada.ca" });
    expect(grouped.act.isSubmitted).toBe(true);
    expect(isActivityComplete(items, grouped.act)).toBe(true);
  });

  it("is not complete when a required response was edited after submit", () => {
    const grouped = groupActivityInputs([
      {
        activity_page_key: "act",
        input_field_key: "q::mc",
        input_value: '"a"',
        is_submitted: true,
      },
      {
        activity_page_key: "act",
        input_field_key: "q::match",
        input_value: '["p1","p2"]',
        is_submitted: false,
      },
      {
        activity_page_key: "act",
        input_field_key: "site",
        input_value: "canada.ca",
        is_submitted: true,
      },
    ]);
    expect(isActivityComplete(items, grouped.act)).toBe(false);
    expect(isActivityComplete(items, undefined)).toBe(false);
  });

  it("builds the upsert body; only a submit sets is_submitted", () => {
    const now = new Date("2026-11-12T10:00:00Z");
    const ids = { lessonId: "L", submoduleId: "S", moduleId: "M" };
    expect(buildActivityInput(ids, "act", "q::mc", '"a"', true, now)).toEqual({
      sanity_lesson_id: "L",
      sanity_submodule_id: "S",
      sanity_module_id: "M",
      activity_page_key: "act",
      input_field_key: "q::mc",
      input_value: '"a"',
      is_submitted: true,
      submitted_at: now.toISOString(),
    });
    expect(
      buildActivityInput(ids, "act", "site", "x", false, now),
    ).toMatchObject({ is_submitted: false });
    expect(
      buildActivityInput(ids, "act", "site", "x", false, now),
    ).not.toHaveProperty("submitted_at");
  });
});
