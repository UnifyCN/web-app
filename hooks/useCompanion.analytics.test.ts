import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Spec UnifyCN/mobile-app#314 / ticket #318: a Companion send reports
// companion_message_sent (conversation_id, turn_number, input_source) and
// companion_response_received (with rag-query's topic). Drives the real
// useSendMessage hook; only the service layer and the PostHog SDK are stubbed.

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  saveMessage: vi.fn(),
  generateReply: vi.fn(),
}));

vi.mock("@/lib/posthog", () => ({
  isPostHogConfigured: () => true,
  posthog: { capture: mocks.capture },
}));

vi.mock("@/services/companion", () => ({
  saveMessage: mocks.saveMessage,
  generateReply: mocks.generateReply,
}));

import { messagesKey, useSendMessage } from "./useCompanion";
import type { ChatMessage } from "@/types";

type SendMessage = ReturnType<typeof useSendMessage>;

/** Render the hook once (server renderer: no DOM needed) and hand back the
 *  mutation; mutateAsync runs outside React. */
function renderSendMessage(client: QueryClient): SendMessage {
  let mutation: SendMessage | null = null;
  function Probe() {
    mutation = useSendMessage();
    return null;
  }
  renderToString(
    createElement(QueryClientProvider, { client }, createElement(Probe)),
  );
  if (!mutation) throw new Error("hook did not render");
  return mutation;
}

const message = (id: number, role: "user" | "assistant"): ChatMessage => ({
  id,
  conversationId: "conv-1",
  role,
  content: role === "user" ? "How do I rent?" : "Here is how.",
  sources: null,
  createdAt: "2026-10-21T00:00:00Z",
});

function eventProps(name: string) {
  const calls = mocks.capture.mock.calls.filter(([event]) => event === name);
  expect(calls).toHaveLength(1);
  return calls[0][1] as Record<string, unknown>;
}

beforeEach(() => {
  vi.stubGlobal("window", {});
  mocks.capture.mockReset();
  mocks.saveMessage.mockReset().mockResolvedValue(undefined);
  mocks.generateReply.mockReset().mockResolvedValue({
    answer: "Look on rental sites.",
    sources: [{ title: "Renting", url: "https://example.org" }],
    suggestedNextSteps: null,
    disclaimerKind: null,
    queryType: "immigration",
    topic: "housing",
    tokenUsage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    estimatedCostUsd: 0.0001,
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("useSendMessage analytics", () => {
  it("first message of a new conversation: turn 1, with its input source", async () => {
    const client = new QueryClient();
    client.setQueryData(messagesKey("conv-1"), []);
    await renderSendMessage(client).mutateAsync({
      conversationIdentifier: "conv-1",
      text: "How do I rent?",
      inputSource: "starter_prompt",
    });
    expect(eventProps("companion_message_sent")).toEqual({
      message_length: 14,
      conversation_id: "conv-1",
      turn_number: 1,
      input_source: "starter_prompt",
    });
  });

  it("a later message counts the earlier user turns", async () => {
    const client = new QueryClient();
    client.setQueryData(messagesKey("conv-1"), [
      message(1, "user"),
      message(2, "assistant"),
      message(3, "user"),
      message(4, "assistant"),
    ]);
    await renderSendMessage(client).mutateAsync({
      conversationIdentifier: "conv-1",
      text: "And the deposit?",
      inputSource: "suggestion",
    });
    expect(eventProps("companion_message_sent")).toMatchObject({
      turn_number: 3,
      input_source: "suggestion",
    });
  });

  it("the response event carries rag-query's topic and usage", async () => {
    const client = new QueryClient();
    client.setQueryData(messagesKey("conv-1"), []);
    await renderSendMessage(client).mutateAsync({
      conversationIdentifier: "conv-1",
      text: "How do I rent?",
      inputSource: "typed",
    });
    const props = eventProps("companion_response_received");
    expect(props).toMatchObject({
      query_type: "immigration",
      topic: "housing",
      has_sources: true,
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
      estimated_cost_usd: 0.0001,
    });
    expect(typeof props.response_time_ms).toBe("number");
    // Metadata only: no question or answer text in any client event.
    const sent = JSON.stringify(mocks.capture.mock.calls);
    expect(sent).not.toContain("How do I rent?");
    expect(sent).not.toContain("Look on rental sites.");
  });
});
