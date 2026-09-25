import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QueryClient } from "@tanstack/react-query";

const captureMock = vi.fn();
vi.mock("@/lib/posthog", () => ({
  isPostHogConfigured: () => true,
  posthog: { capture: (...args: unknown[]) => captureMock(...args) },
}));

import { createDraftHooks } from "./createDraftHooks";

function makeHooks() {
  const noop = () => Promise.reject(new Error("unused"));
  return createDraftHooks({
    service: {
      listDrafts: noop,
      getDraft: noop,
      getUsage: noop,
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

const clientWith = (fetchQuery: () => Promise<unknown>) =>
  ({ fetchQuery }) as unknown as QueryClient;

// Let the fire-and-forget usage read settle.
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("reportPromptSent", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {});
    captureMock.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("sends prompts_used from the fresh usage read", async () => {
    makeHooks().reportPromptSent(
      clientWith(() => Promise.resolve({ count: 7, remaining: 13 })),
      "chat",
    );
    await flush();
    expect(captureMock).toHaveBeenCalledWith("ai_prompt_sent", {
      feature: "resume_builder",
      mode: "chat",
      prompts_used: 7,
      prompt_limit: 20,
    });
  });

  it("still sends the event, without prompts_used, when the read fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    makeHooks().reportPromptSent(
      clientWith(() => Promise.reject(new Error("offline"))),
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
