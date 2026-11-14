import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

const mocks = vi.hoisted(() => ({
  userId: "user-1" as string | null,
  getOrCreateQuizAttempt: vi.fn(),
  saveQuizResponse: vi.fn(),
  closeQuizAttempt: vi.fn(),
  getOpenQuizAttempt: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({}),
  getAuthUserId: async () => mocks.userId,
  isSupabaseConfigured: () => true,
}));
vi.mock("@/services/learnV2", () => ({
  getOrCreateQuizAttempt: mocks.getOrCreateQuizAttempt,
  saveQuizResponse: mocks.saveQuizResponse,
  closeQuizAttempt: mocks.closeQuizAttempt,
  getOpenQuizAttempt: mocks.getOpenQuizAttempt,
}));

import { createQuizPersistence, newQuizSaveState } from "./useLearnV2";

const ids = { lessonId: "L", submoduleId: "S", moduleId: "M" };
const quizzes = [
  {
    _id: "quiz-1",
    questions: [
      { _key: "q1", question_type: "multiple_choice_single", options: [] },
      { _key: "q2", question_type: "multiple_choice_single", options: [] },
    ],
  },
] as never;
const queryKey = ["learn-v2", "quiz-answers", "L", "quiz-1"];

function setup() {
  const queryClient = new QueryClient();
  const state = newQuizSaveState();
  const persistence = createQuizPersistence({
    quizzes,
    ids,
    state,
    queryClient,
    queryKey,
  });
  return { queryClient, state, persistence };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.userId = "user-1";
  let n = 0;
  mocks.getOrCreateQuizAttempt.mockImplementation(async () => `att-${++n}`);
  mocks.saveQuizResponse.mockResolvedValue(true);
  mocks.closeQuizAttempt.mockResolvedValue(undefined);
  mocks.getOpenQuizAttempt.mockResolvedValue(null);
});

describe("Quick Check persistence", () => {
  it("writes each changed answer once and updates the cached answers", async () => {
    const { persistence, queryClient } = setup();
    await persistence.save({ answers: { q1: ["a"] }, completed: false });
    await persistence.save({
      answers: { q1: ["a"], q2: ["b"] },
      completed: false,
    });
    expect(mocks.saveQuizResponse).toHaveBeenCalledTimes(2);
    expect(queryClient.getQueryData(queryKey)).toEqual({
      answers: { q1: ["a"], q2: ["b"] },
    });
  });

  it("a completion retry after closing writes nothing and opens no new attempt", async () => {
    const { persistence } = setup();
    const answers = { q1: ["a"], q2: ["b"] };
    await persistence.save({ answers, completed: true });
    expect(mocks.closeQuizAttempt).toHaveBeenCalledWith("att-1");
    await persistence.save({ answers, completed: true });
    expect(mocks.getOrCreateQuizAttempt).toHaveBeenCalledTimes(1);
    expect(mocks.saveQuizResponse).toHaveBeenCalledTimes(2);
    expect(mocks.closeQuizAttempt).toHaveBeenCalledTimes(1);
  });

  it("does not reuse another account's attempt or saved answers", async () => {
    const { persistence } = setup();
    await persistence.save({ answers: { q1: ["a"] }, completed: false });
    mocks.userId = "user-2";
    await persistence.save({ answers: { q1: ["a"] }, completed: false });
    expect(mocks.getOrCreateQuizAttempt).toHaveBeenCalledTimes(2);
    expect(mocks.saveQuizResponse).toHaveBeenLastCalledWith(
      "att-2",
      "q1",
      "multiple_choice_single",
      "a",
      false,
    );
  });

  it("keeps a failed answer unsaved so the next save resends it", async () => {
    const { persistence } = setup();
    mocks.saveQuizResponse.mockRejectedValueOnce(new Error("offline"));
    await expect(
      persistence.save({ answers: { q1: ["a"] }, completed: false }),
    ).rejects.toThrow("offline");
    await persistence.save({ answers: { q1: ["a"] }, completed: false });
    expect(mocks.saveQuizResponse).toHaveBeenCalledTimes(2);
  });
});
