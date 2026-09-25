import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const captureMock = vi.fn();
vi.mock("@/lib/posthog", () => ({
  isPostHogConfigured: () => true,
  posthog: { capture: (...args: unknown[]) => captureMock(...args) },
}));

import { createDraftHooks } from "./createDraftHooks";

function makeHooks(
  getUsage: () => Promise<{ count: number; remaining: number }>,
  isLimitError: (err: unknown) => boolean = () => false,
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
      isLimitError,
    },
  });
}

// Let the fire-and-forget usage read settle.
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("reportPromptSent", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {});
    captureMock.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("sends prompts_used from the fresh usage read", async () => {
    makeHooks(() =>
      Promise.resolve({ count: 7, remaining: 13 }),
    ).reportPromptSent("chat");
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
    makeHooks(() => Promise.reject(new Error("offline"))).reportPromptSent(
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

  it("does not report the cap below the limit", async () => {
    makeHooks(() =>
      Promise.resolve({ count: 19, remaining: 1 }),
    ).reportPromptSent("chat");
    await flush();
    expect(captureMock).not.toHaveBeenCalledWith(
      "ai_prompt_limit_reached",
      expect.anything(),
    );
  });

  it("reports the cap as exhausted when a turn uses the last prompt", async () => {
    makeHooks(() =>
      Promise.resolve({ count: 20, remaining: 0 }),
    ).reportPromptSent("import");
    await flush();
    expect(captureMock).toHaveBeenCalledWith("ai_prompt_limit_reached", {
      feature: "resume_builder",
      prompt_limit: 20,
      trigger: "import",
      reason: "exhausted",
    });
  });
});

describe("reportLimitReached", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {});
    captureMock.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  const unused = () => Promise.reject(new Error("unused"));

  it("reports a 429 as blocked", () => {
    makeHooks(unused, () => true).reportLimitReached(new Error("429"), "chat");
    expect(captureMock).toHaveBeenCalledWith("ai_prompt_limit_reached", {
      feature: "resume_builder",
      prompt_limit: 20,
      trigger: "chat",
      reason: "blocked",
    });
  });

  it("ignores errors that aren't the daily limit", () => {
    makeHooks(unused).reportLimitReached(new Error("busy"), "chat");
    expect(captureMock).not.toHaveBeenCalled();
  });
});
