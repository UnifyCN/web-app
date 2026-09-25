import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QueryClient } from "@tanstack/react-query";

const captureMock = vi.fn();
vi.mock("@/lib/posthog", () => ({
  isPostHogConfigured: () => true,
  posthog: { capture: (...args: unknown[]) => captureMock(...args) },
}));

import { createDraftHooks } from "./createDraftHooks";

function makeHooks(
  getUsage: () => Promise<{ count: number; remaining: number }>,
) {
  const noop = () => Promise.reject(new Error("unused"));
  return createDraftHooks({
    service: {
      listDrafts: noop,
      getDraft: noop,
      getUsage,
      fetchJobPosting: noop,
      setDraftJobPosting: noop,
      deleteDraft: noop,
      renameDraft: noop,
      duplicateDraft: noop,
    },
    keys: { drafts: ["d"], usage: ["u"], draftKey: (id) => ["d", id] },
    analytics: {
      feature: "resume_builder",
      promptLimit: 20,
      isLimitError: () => false,
    },
  });
}

const setQueryData = vi.fn();
const client = { setQueryData } as unknown as QueryClient;

// Let the fire-and-forget usage read settle.
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("reportPromptSent", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {});
    captureMock.mockReset();
    setQueryData.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("sends prompts_used from the fresh usage read", async () => {
    makeHooks(() =>
      Promise.resolve({ count: 7, remaining: 13 }),
    ).reportPromptSent(client, "chat");
    await flush();
    // The fresh read also refreshes the quota meter's cache.
    expect(setQueryData).toHaveBeenCalledWith(["u"], {
      count: 7,
      remaining: 13,
    });
    expect(captureMock).toHaveBeenCalledWith("ai_prompt_sent", {
      feature: "resume_builder",
      mode: "chat",
      prompts_used: 7,
      prompt_limit: 20,
    });
  });

  it("still sends the event, without prompts_used, when the read fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    makeHooks(() => Promise.reject(new Error("offline"))).reportPromptSent(
      client,
      "import",
    );
    await flush();
    expect(captureMock).toHaveBeenCalledWith("ai_prompt_sent", {
      feature: "resume_builder",
      mode: "import",
      prompt_limit: 20,
    });
    warn.mockRestore();
  });
});
