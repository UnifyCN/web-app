import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthUserId: vi.fn(),
  from: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ from: mocks.from }),
  getAuthUserId: mocks.getAuthUserId,
  isSupabaseConfigured: () => true,
}));

vi.mock("@/lib/sanity", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/sanity")>("@/lib/sanity");
  return {
    ...actual,
    isSanityConfigured: () => true,
    sanityClient: { fetch: mocks.fetch },
  };
});

import {
  completeLesson,
  enqueueLessonWrite,
  getCourseV2,
  getLessonV2,
  maybeMarkCourseCompleted,
  saveLessonPage,
  saveResumePosition,
} from "./learnV2";

const ids = { lessonId: "L", submoduleId: "S", moduleId: "M" };

/** A chainable fake of the Supabase query builder. */
function table(result: { data?: unknown; error?: unknown } = {}) {
  const resolved = { data: result.data ?? null, error: result.error ?? null };
  const builder: Record<string, unknown> = {};
  for (const name of ["select", "eq", "in"])
    builder[name] = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(async () => resolved);
  builder.upsert = vi.fn(async () => ({ error: null }));
  builder.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) =>
    Promise.resolve(resolved).then(ok, bad);
  return builder as {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    in: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAuthUserId.mockResolvedValue("user-1");
});

describe("progress writes", () => {
  it("upserts the mobile row shape on the shared key", async () => {
    const progress = table();
    mocks.from.mockReturnValue(progress);

    await saveLessonPage(ids, "lesson", 2, 4);

    expect(mocks.from).toHaveBeenCalledWith("user_lesson_progress");
    const [body, options] = progress.upsert.mock.calls[0];
    expect(options).toEqual({ onConflict: "user_id,sanity_lesson_id" });
    expect(body).toMatchObject({
      user_id: "user-1",
      sanity_lesson_id: "L",
      sanity_submodule_id: "S",
      sanity_module_id: "M",
      current_page_type: "lesson",
      current_page_number: 2,
      total_pages: 4,
      completed_pages: 2,
      progress_percent: 50,
      is_in_progress: true,
    });
  });

  it("writes nothing when signed out", async () => {
    mocks.getAuthUserId.mockResolvedValue(null);
    const progress = table();
    mocks.from.mockReturnValue(progress);
    expect(await saveResumePosition(ids, "lesson", 1)).toBe(false);
    expect(progress.upsert).not.toHaveBeenCalled();
  });

  it("runs one lesson's writes strictly in call order", async () => {
    const order: string[] = [];
    let releaseFirst: (() => void) | undefined;
    const first = enqueueLessonWrite(
      "queue-order",
      () =>
        new Promise<void>((resolve) => {
          releaseFirst = () => {
            order.push("first");
            resolve();
          };
        }),
    );
    const second = enqueueLessonWrite("queue-order", async () => {
      order.push("second");
    });
    await vi.waitFor(() => expect(releaseFirst).toBeTypeOf("function"));
    expect(order).toEqual([]);
    releaseFirst?.();
    await Promise.all([first, second]);
    expect(order).toEqual(["first", "second"]);
  });

  it("keeps the queue going after a failed write", async () => {
    const failed = enqueueLessonWrite("L2", async () => {
      throw new Error("network");
    });
    await expect(failed).rejects.toThrow("network");
    await expect(enqueueLessonWrite("L2", async () => "ok")).resolves.toBe(
      "ok",
    );
  });

  it("completes a lesson then checks the course", async () => {
    const progress = table({ data: [{ sanity_lesson_id: "L" }] });
    const course = table({ data: null });
    mocks.from.mockImplementation((name: string) =>
      name === "learn_progress" ? course : progress,
    );
    mocks.fetch.mockResolvedValue({ lessonIds: ["L"] });

    expect(await completeLesson(ids, 5)).toBe(true);
    expect(progress.upsert.mock.calls[0][0]).toMatchObject({
      is_completed: true,
      is_in_progress: false,
      progress_percent: 100,
      completed_pages: 5,
      total_pages: 5,
    });
    await vi.waitFor(() => expect(course.upsert).toHaveBeenCalled());
    expect(course.upsert.mock.calls[0]).toEqual([
      expect.objectContaining({
        user_id: "user-1",
        module_id: "M",
        status: "completed",
      }),
      { onConflict: "user_id,module_id" },
    ]);
  });
});

describe("maybeMarkCourseCompleted", () => {
  it("does not mark a course with unfinished lessons", async () => {
    const progress = table({ data: [{ sanity_lesson_id: "a" }] });
    const course = table({ data: { status: "in_progress" } });
    mocks.from.mockImplementation((name: string) =>
      name === "learn_progress" ? course : progress,
    );
    mocks.fetch.mockResolvedValue({ lessonIds: ["a", "b"] });
    await maybeMarkCourseCompleted("M");
    expect(course.upsert).not.toHaveBeenCalled();
  });

  it("never touches a course already completed", async () => {
    const course = table({ data: { status: "completed" } });
    mocks.from.mockReturnValue(course);
    await maybeMarkCourseCompleted("M");
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(course.upsert).not.toHaveBeenCalled();
  });
});

describe("content", () => {
  it("orders a translated lesson's blocks and uses its sections", async () => {
    const blocks = [
      {
        _key: "a",
        _type: "lesson_content",
        content: [],
        contentVersion: 2,
        sections: [{ _type: "lessonConcept", _key: "en", content: [] }],
      },
      { _key: "b", _type: "lesson_activity", title: "Act" },
    ];
    mocks.fetch.mockResolvedValue({
      _id: "L",
      _type: "lesson",
      title: "Lesson",
      order: 1,
      content_blocks: blocks,
      quizzes: [{ _id: "q", question_count: 2 }],
      i18n: {
        title: "Leçon",
        content_blocks: [
          {
            ...blocks[0],
            sections: [{ _type: "lessonConcept", _key: "fr", content: [] }],
          },
          blocks[1],
        ],
      },
    });
    const lesson = await getLessonV2("L", "fr-CA");
    expect(lesson?.title).toBe("Leçon");
    expect(lesson?.pages?.map((p) => p._key)).toEqual(["a", "b"]);
    expect(lesson?.pages?.[0].sections?.[0]._key).toBe("fr");
    expect(lesson?.totalPages).toBe(4); // 2 steps + 2 quiz questions
  });

  it("builds course lesson stubs with reading time and the progress total", async () => {
    mocks.fetch.mockResolvedValue({
      _id: "M",
      title: "Employment",
      i18n: { title: "Emploi" },
      submodules: [
        {
          _id: "S",
          title: "Module",
          order: 1,
          lessons: [
            {
              _id: "L",
              title: "Lesson",
              order: 1,
              lesson_page_count: 3,
              activity_page_count: 0,
              ending_page_count: 0,
              quizzes: [],
              steps: [{ readingMinutes: 2 }, { content: [] }],
            },
          ],
        },
      ],
    });
    const course = await getCourseV2("M", "fr-CA");
    expect(course?.title).toBe("Emploi");
    expect(course?.submodules[0].lessons[0]).toMatchObject({
      readingMinutes: 2,
      totalPages: 3,
    });
    expect(course?.submodules[0].lessons[0]).not.toHaveProperty("steps");
  });
});

describe("lessons without blocks", () => {
  it("counts the legacy pages for the progress total", async () => {
    mocks.fetch.mockResolvedValue({
      _id: "L",
      _type: "lesson",
      title: "Old",
      order: 1,
      pages: [
        { _key: "a", order: 1, content: [] },
        { _key: "b", order: 2, content: [] },
      ],
      ending_pages: [{ _key: "e", order: 1, content: [] }],
      quizzes: [],
    });
    const lesson = await getLessonV2("L", "en");
    expect(lesson?.totalPages).toBe(3);
  });
});

describe("course completion write failure", () => {
  it("throws so the caller can log it", async () => {
    const progress = table({ data: [{ sanity_lesson_id: "a" }] });
    const course = table({ data: null });
    course.upsert.mockResolvedValue({ error: new Error("denied") });
    mocks.from.mockImplementation((name: string) =>
      name === "learn_progress" ? course : progress,
    );
    mocks.fetch.mockResolvedValue({ lessonIds: ["a"] });
    await expect(maybeMarkCourseCompleted("M")).rejects.toThrow("denied");
  });
});

describe("translated lessons keep the English structure (mobile parity)", () => {
  it("keeps base block order and keys when a translation reorders or drops blocks", async () => {
    const base = [
      { _key: "a", _type: "lesson_content", title: "A", content: [] },
      { _key: "b", _type: "lesson_activity", title: "B" },
      { _key: "c", _type: "lesson_content", title: "C", content: [] },
    ];
    mocks.fetch.mockResolvedValue({
      _id: "L",
      _type: "lesson",
      title: "Lesson",
      order: 1,
      content_blocks: base,
      quizzes: [],
      i18n: {
        content_blocks: [
          { _key: "c", _type: "lesson_content", title: "C-fr", content: [] },
          { _key: "a", _type: "lesson_content", title: "A-fr", content: [] },
          { _key: "x", _type: "lesson_content", title: "extra", content: [] },
        ],
      },
    });
    const lesson = await getLessonV2("L", "fr-CA");
    expect(lesson?.pages?.map((p) => p._key)).toEqual(["a", "b", "c"]);
    expect(lesson?.pages?.map((p) => p.title)).toEqual(["A-fr", "B", "C-fr"]);
    expect(lesson?.totalPages).toBe(3);
  });
});
