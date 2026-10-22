import { describe, expect, it } from "vitest";
import {
  COMPANION_TOPICS,
  companionTurnNumber,
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

describe("companionTurnNumber", () => {
  const user = (id: number) => ({ id, role: "user" as const });
  const assistant = (id: number) => ({ id, role: "assistant" as const });

  it("is 1 for the first message of a conversation (only its own optimistic bubble)", () => {
    expect(companionTurnNumber([user(-1)])).toBe(1);
  });

  it("counts earlier user messages, not assistant replies", () => {
    expect(
      companionTurnNumber([user(1), assistant(2), user(3), assistant(4), user(-5)]),
    ).toBe(3);
  });

  it("counts a second send made before the first one finished", () => {
    expect(companionTurnNumber([user(1), assistant(2), user(-3), user(-4)])).toBe(3);
  });

  it("is never below 1", () => {
    expect(companionTurnNumber([])).toBe(1);
  });
});
