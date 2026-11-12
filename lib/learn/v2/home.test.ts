import { describe, expect, it } from "vitest";
import type { LearnModuleView } from "@/types";
import { isVisibleForProvince } from "@/lib/province";
import { courseSummaries, resumeEntries } from "./home";
import type { LessonProgressRow } from "./progress";

function course(
  id: string,
  province: string | null,
  lessons: string[][],
): LearnModuleView {
  return {
    _id: id,
    _type: "module",
    title: `Course ${id}`,
    province,
    status: "not_started",
    progressPercent: 0,
    isFavourite: false,
    submodules: lessons.map((ids, i) => ({
      _id: `${id}-s${i + 1}`,
      _type: "submodule",
      title: `Module ${i + 1}`,
      order: i + 1,
      lessons: ids.map((l, j) => ({
        _id: l,
        _type: "lesson",
        title: `Lesson ${l}`,
        order: j + 1,
      })),
    })),
  } as unknown as LearnModuleView;
}

const national = course("nat", null, [["a", "b"], ["c"]]);
const bc = course("bc", "British Columbia", [["x"]]);

describe("courseSummaries", () => {
  it("counts modules and lessons and the completed percentage", () => {
    const [s] = courseSummaries(
      [national],
      [
        { sanity_lesson_id: "a", is_completed: true },
        { sanity_lesson_id: "b", is_in_progress: true },
      ],
    );
    expect(s).toMatchObject({
      moduleCount: 2,
      lessonCount: 3,
      percent: 33,
      started: true,
    });
  });

  it("is not started with no rows and no course status", () => {
    const [s] = courseSummaries([national], []);
    expect(s).toMatchObject({ percent: 0, started: false });
  });

  it("counts a course status as started", () => {
    const [s] = courseSummaries([{ ...national, status: "in_progress" }], []);
    expect(s.started).toBe(true);
  });
});

describe("resumeEntries", () => {
  const rows: LessonProgressRow[] = [
    {
      sanity_lesson_id: "a",
      is_completed: true,
      last_accessed_at: "2026-11-12T09:00:00Z",
    },
    {
      sanity_lesson_id: "b",
      is_in_progress: true,
      progress_percent: 50,
      current_page_type: "lesson",
      current_page_number: 2,
      last_accessed_at: "2026-11-11T09:00:00Z",
    },
    {
      sanity_lesson_id: "c",
      completed_pages: 1,
      current_page_type: "lesson",
      current_page_number: 1,
      last_accessed_at: "2026-11-12T08:00:00Z",
    },
    {
      sanity_lesson_id: "x",
      is_in_progress: true,
      last_accessed_at: "2026-11-12T10:00:00Z",
    },
  ];

  it("lists unfinished lessons, most recent first, with their position", () => {
    const entries = resumeEntries([national, bc], rows);
    expect(entries.map((e) => e.lessonId)).toEqual(["x", "c", "b"]);
    expect(entries[2]).toMatchObject({
      courseId: "nat",
      submoduleId: "nat-s1",
      moduleNumber: 1,
      lessonNumber: 2,
      lessonCount: 2,
      percent: 50,
      href: "/learn/nat/nat-s1/b?step=2",
    });
  });

  it("drops lessons of courses hidden by province targeting", () => {
    const visible = [national, bc].filter((c) =>
      isVisibleForProvince(c.province, "Ontario"),
    );
    expect(resumeEntries(visible, rows).map((e) => e.lessonId)).toEqual([
      "c",
      "b",
    ]);
    const inBc = [national, bc].filter((c) =>
      isVisibleForProvince(c.province, "British Columbia"),
    );
    expect(resumeEntries(inBc, rows).map((e) => e.lessonId)).toContain("x");
  });

  it("respects the limit", () => {
    expect(resumeEntries([national, bc], rows, 1)).toHaveLength(1);
  });
});
