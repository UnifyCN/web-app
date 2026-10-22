import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Spec UnifyCN/mobile-app#314 / ticket #318: rag-query returns a `topic` label
// beside `queryType`; the web client reads it (and the usage numbers) for the
// companion_response_received event. A rag-query that predates the field must
// still work.

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(),
  getAuthUserId: vi.fn(),
  isSupabaseConfigured: () => true,
}));

import { generateReply } from "./companion";

const fetchMock = vi.fn();

function reply(body: Record<string, unknown>) {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
  return generateReply({
    conversationIdentifier: "conv-1",
    prompt: "How do I rent an apartment?",
    history: [],
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("generateReply", () => {
  it("returns the topic, queryType and usage from rag-query", async () => {
    const result = await reply({
      answer: "Start with a rental site.",
      queryType: "immigration",
      topic: "housing",
      tokenUsage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      estimatedCostUsd: 0.0001,
    });
    expect(result).toMatchObject({
      answer: "Start with a rental site.",
      queryType: "immigration",
      topic: "housing",
      tokenUsage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      estimatedCostUsd: 0.0001,
    });
  });

  it("works with a rag-query that sends no topic or usage", async () => {
    const result = await reply({ answer: "Hello!" });
    expect(result.answer).toBe("Hello!");
    expect(result.topic).toBeNull();
    expect(result.queryType).toBeNull();
    expect(result.tokenUsage).toBeNull();
    expect(result.estimatedCostUsd).toBeNull();
  });

  it("drops a topic that is not on the fixed list", async () => {
    const result = await reply({ answer: "Hi", topic: "How do I rent?" });
    expect(result.topic).toBeNull();
  });
});
