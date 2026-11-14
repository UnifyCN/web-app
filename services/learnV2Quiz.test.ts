import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthUserId: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ from: mocks.from }),
  getAuthUserId: mocks.getAuthUserId,
  isSupabaseConfigured: () => true,
}));

import {
  closeQuizAttempt,
  getOpenQuizAttempt,
  getOrCreateQuizAttempt,
  hasQuizAttempt,
  saveQuizResponse,
} from "./learnV2";
import { loadQuizAnswers } from "@/hooks/useLearnV2";

const ids = { lessonId: "L", submoduleId: "S", moduleId: "M" };

/** A chainable fake query; each table returns the results queued for it. */
function fakeDb(
  results: Record<string, { data?: unknown; error?: unknown }[]>,
) {
  const calls: { table: string; op: string; args: unknown[] }[] = [];
  mocks.from.mockImplementation((table: string) => {
    const next = () => results[table]?.shift() ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};
    for (const op of ["select", "eq", "is", "order", "limit"]) {
      builder[op] = (...args: unknown[]) => {
        calls.push({ table, op, args });
        return builder;
      };
    }
    for (const op of ["insert", "update", "upsert"]) {
      builder[op] = (...args: unknown[]) => {
        calls.push({ table, op, args });
        return builder;
      };
    }
    builder.single = async () => next();
    builder.then = (
      ok: (v: unknown) => unknown,
      bad?: (e: unknown) => unknown,
    ) => Promise.resolve(next()).then(ok, bad);
    return builder;
  });
  return calls;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAuthUserId.mockResolvedValue("user-1");
});

describe("Quick Check answers in mobile's tables", () => {
  it("reads the open attempt and its responses keyed by question _key", async () => {
    fakeDb({
      user_quiz_attempts: [{ data: [{ id: "att-1" }] }],
      user_quiz_responses: [
        { data: [{ sanity_question_id: "q1", user_answer: "a" }] },
      ],
    });
    expect(await getOpenQuizAttempt("quiz-1")).toEqual({
      attemptId: "att-1",
      responses: { q1: "a" },
    });
  });

  it("starts the next attempt number when none is open, like mobile", async () => {
    const calls = fakeDb({
      user_quiz_attempts: [
        { data: [] }, // no open attempt
        { data: [{ attempt_number: 2 }] }, // last attempt
        { data: { id: "att-3" } }, // insert
      ],
    });
    expect(await getOrCreateQuizAttempt("quiz-1", ids)).toBe("att-3");
    const insert = calls.find((c) => c.op === "insert");
    expect(insert?.args[0]).toEqual({
      user_id: "user-1",
      sanity_quiz_id: "quiz-1",
      sanity_lesson_id: "L",
      sanity_submodule_id: "S",
      sanity_module_id: "M",
      attempt_number: 3,
      total_questions: 0,
    });
  });

  it("upserts an answer on the attempt + question key with mobile's columns", async () => {
    const calls = fakeDb({ user_quiz_responses: [{ error: null }] });
    expect(
      await saveQuizResponse(
        "att-1",
        "q1",
        "multiple_choice_single",
        "a",
        true,
      ),
    ).toBe(true);
    const upsert = calls.find((c) => c.op === "upsert");
    expect(upsert?.args[0]).toMatchObject({
      user_id: "user-1",
      quiz_attempt_id: "att-1",
      sanity_question_id: "q1",
      question_type: "multiple_choice_single",
      user_answer: "a",
      is_correct: true,
    });
    expect(upsert?.args[1]).toEqual({
      onConflict: "quiz_attempt_id,sanity_question_id",
    });
  });

  it("writes nothing when signed out", async () => {
    mocks.getAuthUserId.mockResolvedValue(null);
    const calls = fakeDb({});
    expect(await saveQuizResponse("att-1", "q1", "x", "a", false)).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("closes an open attempt by setting completed_at", async () => {
    const calls = fakeDb({ user_quiz_attempts: [{ error: null }] });
    await closeQuizAttempt("att-1");
    const update = calls.find((c) => c.op === "update");
    expect(update?.args[0]).toHaveProperty("completed_at");
    expect(
      calls.some((c) => c.op === "is" && c.args[0] === "completed_at"),
    ).toBe(true);
  });

  it("turns open attempts into web answers, or null when none is open", async () => {
    fakeDb({
      user_quiz_attempts: [{ data: [{ id: "att-1" }] }],
      user_quiz_responses: [
        {
          data: [
            { sanity_question_id: "q1", user_answer: "a" },
            { sanity_question_id: "q2", user_answer: ["x", "y"] },
          ],
        },
      ],
    });
    const quiz = {
      _id: "quiz-1",
      questions: [
        { _key: "q1", question_type: "multiple_choice_single" },
        { _key: "q2", question_type: "multiple_choice_multiple" },
      ],
    } as never;
    expect(await loadQuizAnswers([quiz])).toEqual({
      answers: { q1: ["a"], q2: ["x", "y"] },
    });

    fakeDb({ user_quiz_attempts: [{ data: [] }, { data: [] }] });
    expect(await loadQuizAnswers([quiz])).toBeNull();
  });

  it("starts fresh, without the legacy fallback, once the shared attempt is finished", async () => {
    fakeDb({
      user_quiz_attempts: [
        { data: [] }, // no open attempt
        { data: [{ id: "att-1" }] }, // but a finished one exists
      ],
    });
    const quiz = {
      _id: "quiz-1",
      questions: [{ _key: "q1", question_type: "multiple_choice_single" }],
    } as never;
    expect(await loadQuizAnswers([quiz])).toEqual({ answers: {} });
  });

  it("reports whether any attempt exists for the quiz", async () => {
    fakeDb({ user_quiz_attempts: [{ data: [{ id: "a" }] }, { data: [] }] });
    expect(await hasQuizAttempt("quiz-1")).toBe(true);
    expect(await hasQuizAttempt("quiz-1")).toBe(false);
  });
});
