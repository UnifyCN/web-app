import { describe, expect, it } from "vitest";
import {
  COMPANION_TOPICS,
  companionTurnNumber,
  isConversationHistoryLoaded,
  parseCompanionTopic,
} from "./companionAnalytics";

describe("parseCompanionTopic", () => {
  it("accepts every topic on the approved list", () => {
    expect([...COMPANION_TOPICS]).toEqual([
      "immigration",
      "work",
      "housing",
      "money",
      "taxes",
      "health",
      "education",
      "transportation",
      "settling_in",
      "other",
    ]);
    for (const topic of COMPANION_TOPICS) {
      expect(parseCompanionTopic(topic)).toBe(topic);
    }
  });

  it("is null when an older rag-query sends no topic", () => {
    expect(parseCompanionTopic(undefined)).toBeNull();
    expect(parseCompanionTopic(null)).toBeNull();
  });

  it("is null for anything off the list, so no free text reaches analytics", () => {
    expect(parseCompanionTopic("How do I rent an apartment?")).toBeNull();
    expect(parseCompanionTopic("Housing")).toBeNull();
    expect(parseCompanionTopic(3)).toBeNull();
  });
});

describe("isConversationHistoryLoaded", () => {
  it("is false until a saved (server) message is in the thread", () => {
    expect(isConversationHistoryLoaded([])).toBe(false);
    // Only this send's optimistic bubble: the load has not landed yet.
    expect(isConversationHistoryLoaded([{ id: -1 }])).toBe(false);
    expect(isConversationHistoryLoaded([{ id: 1 }, { id: -2 }])).toBe(true);
  });
});

describe("companionTurnNumber", () => {
  const user = (id: number) => ({ id, role: "user" as const });
  const assistant = (id: number) => ({ id, role: "assistant" as const });

  it("is 1 for the first message of a new conversation (only its own optimistic bubble)", () => {
    expect(companionTurnNumber([user(-1)], true)).toBe(1);
  });

  it("is undefined while an existing conversation's history has not loaded", () => {
    // Same thread as a new conversation's first send, but the conversation
    // already exists: its earlier messages are just not here yet.
    expect(companionTurnNumber([user(-1)], false)).toBeUndefined();
    expect(companionTurnNumber([], false)).toBeUndefined();
  });

  it("after the history loads: earlier user messages + 1, assistant replies not counted", () => {
    expect(
      companionTurnNumber([user(1), assistant(2), user(3), assistant(4), user(-5)], false),
    ).toBe(3);
  });

  it("counts a second send made before the first one finished", () => {
    expect(
      companionTurnNumber([user(1), assistant(2), user(-3), user(-4)], false),
    ).toBe(3);
  });

  it("is never below 1 for a new conversation", () => {
    expect(companionTurnNumber([], true)).toBe(1);
  });
});
