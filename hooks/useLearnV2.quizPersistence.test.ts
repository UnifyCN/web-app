import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

const mocks = vi.hoisted(() => ({
  userId: "user-1" as string | null,
  configured: true,
  open: null as string | null, // the open attempt, as the database sees it
  getOrCreateQuizAttempt: vi.fn(),
  saveQuizResponse: vi.fn(),
  closeQuizAttempt: vi.fn(),
  getOpenQuizAttempt: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({}),
  getAuthUserId: async () => {
    if (!mocks.configured) throw new Error("no Supabase client");
    return mocks.userId;
  },
  isSupabaseConfigured: () => mocks.configured,
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
  mocks.configured = true;
  mocks.open = null;
  let n = 0;
  mocks.getOrCreateQuizAttempt.mockImplementation(async () => {
    mocks.open ??= `att-${++n}`;
    return mocks.open;
  });
  mocks.saveQuizResponse.mockResolvedValue(true);
  mocks.closeQuizAttempt.mockImplementation(async () => {
    mocks.open = null;
  });
  mocks.getOpenQuizAttempt.mockImplementation(async () =>
    mocks.open ? { attemptId: mocks.open, responses: {} } : null,
  );
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
    expect(mocks.closeQuizAttempt).toHaveBeenCalledWith("att-1", "user-1");
    await persistence.save({ answers, completed: true });
    expect(mocks.getOrCreateQuizAttempt).toHaveBeenCalledTimes(1);
    expect(mocks.saveQuizResponse).toHaveBeenCalledTimes(2);
    expect(mocks.closeQuizAttempt).toHaveBeenCalledTimes(1);
  });

  it("does not reuse another account's attempt or saved answers", async () => {
    const { persistence } = setup();
    await persistence.save({ answers: { q1: ["a"] }, completed: false });
    mocks.userId = "user-2";
    mocks.open = null; // user-2 has no open attempt of their own
    await persistence.save({ answers: { q1: ["a"] }, completed: false });
    expect(mocks.getOrCreateQuizAttempt).toHaveBeenCalledTimes(2);
    expect(mocks.saveQuizResponse).toHaveBeenLastCalledWith(
      "att-2",
      "q1",
      "multiple_choice_single",
      "a",
      false,
      "user-2",
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

  it("does not cache answers when the account changed during the save", async () => {
    const { persistence, queryClient } = setup();
    mocks.saveQuizResponse.mockImplementationOnce(async () => {
      mocks.userId = null; // signed out while the write was in flight
      return true;
    });
    await expect(
      persistence.save({ answers: { q1: ["a"] }, completed: false }),
    ).rejects.toThrow("Account changed");
    expect(queryClient.getQueryData(queryKey)).toBeUndefined();
  });

  it("does not write a queued save under an account that signed in later", async () => {
    const { persistence } = setup();
    let release!: () => void;
    mocks.saveQuizResponse.mockImplementationOnce(
      () => new Promise<boolean>((r) => (release = () => r(true))),
    );
    const first = persistence.save({
      answers: { q1: ["a"] },
      completed: false,
    });
    await vi.waitFor(() => expect(release).toBeDefined());
    // Queued by user-1, then user-2 signs in before it runs.
    const queued = persistence.save({
      answers: { q1: ["a"], q2: ["b"] },
      completed: false,
    });
    mocks.userId = "user-2";
    release();
    await expect(first).rejects.toThrow("Account changed");
    await expect(queued).rejects.toThrow("Account changed");
    expect(mocks.saveQuizResponse).toHaveBeenCalledTimes(1);
  });

  it("works without Supabase (mock mode has no session)", async () => {
    mocks.configured = false;
    const { persistence } = setup();
    await persistence.save({ answers: { q1: ["a"] }, completed: true });
    expect(mocks.saveQuizResponse).toHaveBeenCalledTimes(1);
    // Mock mode has no account, so no owner is passed on.
    expect(mocks.closeQuizAttempt).toHaveBeenCalledWith("att-1", undefined);
  });

  it("binds attempt creation to the account that queued the save", async () => {
    const { persistence } = setup();
    await persistence.save({ answers: { q1: ["a"] }, completed: false });
    expect(mocks.getOrCreateQuizAttempt).toHaveBeenCalledWith(
      "quiz-1",
      ids,
      "user-1",
    );
  });

  it("rejects completion when the account changes while attempts close", async () => {
    const { persistence } = setup();
    mocks.closeQuizAttempt.mockImplementationOnce(async () => {
      mocks.userId = "user-2";
    });
    await expect(
      persistence.save({ answers: { q1: ["a"], q2: ["b"] }, completed: true }),
    ).rejects.toThrow("Account changed");
  });

  it("moves to a new attempt when another client closed the cached one", async () => {
    const { persistence } = setup();
    await persistence.save({ answers: { q1: ["a"] }, completed: false });
    // Mobile finished att-1 meanwhile: no open attempt any more.
    mocks.open = null;
    await persistence.save({
      answers: { q1: ["a"], q2: ["b"] },
      completed: false,
    });
    expect(mocks.getOrCreateQuizAttempt).toHaveBeenCalledTimes(2);
    // Both answers are rewritten into the new attempt.
    const calls = mocks.saveQuizResponse.mock.calls.slice(1);
    expect(calls.map((c) => [c[0], c[1]])).toEqual([
      ["att-2", "q1"],
      ["att-2", "q2"],
    ]);
  });

  it("keeps writing to the cached attempt while it is still open", async () => {
    const { persistence } = setup();
    await persistence.save({ answers: { q1: ["a"] }, completed: false });
    await persistence.save({
      answers: { q1: ["a"], q2: ["b"] },
      completed: false,
    });
    expect(mocks.getOrCreateQuizAttempt).toHaveBeenCalledTimes(1);
    expect(mocks.saveQuizResponse).toHaveBeenLastCalledWith(
      "att-1",
      "q2",
      "multiple_choice_single",
      "b",
      false,
      "user-1",
    );
  });

  it("retries a part-way completion without reopening a closed quiz", async () => {
    const queryClient = new QueryClient();
    const state = newQuizSaveState();
    const opens = new Map<string, string>();
    let n = 0;
    mocks.getOrCreateQuizAttempt.mockImplementation(async (quizId: string) => {
      if (!opens.has(quizId)) opens.set(quizId, `att-${++n}`);
      return opens.get(quizId);
    });
    mocks.getOpenQuizAttempt.mockImplementation(async (quizId: string) =>
      opens.has(quizId)
        ? { attemptId: opens.get(quizId), responses: {} }
        : null,
    );
    mocks.closeQuizAttempt.mockImplementation(async (attemptId: string) => {
      if (attemptId === "att-2" && !failedOnce) {
        failedOnce = true;
        throw new Error("network");
      }
      for (const [quizId, id] of opens)
        if (id === attemptId) opens.delete(quizId);
    });
    let failedOnce = false;
    const twoQuizzes = [
      {
        _id: "quiz-1",
        questions: [
          { _key: "q1", question_type: "multiple_choice_single", options: [] },
        ],
      },
      {
        _id: "quiz-2",
        questions: [
          { _key: "q2", question_type: "multiple_choice_single", options: [] },
        ],
      },
    ] as never;
    const persistence = createQuizPersistence({
      quizzes: twoQuizzes,
      ids,
      state,
      queryClient,
      queryKey,
    });
    const answers = { q1: ["a"], q2: ["b"] };
    await expect(
      persistence.save({ answers, completed: true }),
    ).rejects.toThrow("network");
    await persistence.save({ answers, completed: true });
    // quiz-1 was closed on the first try and is not reopened by the retry.
    expect(mocks.getOrCreateQuizAttempt).toHaveBeenCalledTimes(2);
    expect(mocks.saveQuizResponse).toHaveBeenCalledTimes(2);
    expect(mocks.closeQuizAttempt.mock.calls.map((c) => c[0])).toEqual([
      "att-1",
      "att-2",
      "att-2",
    ]);
  });
});
