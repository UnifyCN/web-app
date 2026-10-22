import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const captureMock = vi.fn();
vi.mock("@/lib/posthog", () => ({
  isPostHogConfigured: () => true,
  posthog: { capture: (...args: unknown[]) => captureMock(...args) },
}));

import {
  jobSourceDomain,
  trackAiPromptLimitReached,
  trackAiPromptSent,
  trackCompanionMessageSent,
  trackCompanionResponseReceived,
  trackCoverLetterCreated,
  trackCoverLetterExported,
  trackJobPostingImported,
  trackResumeCreated,
  trackResumeExported,
} from "./analytics";

describe("jobSourceDomain", () => {
  it("keeps only the hostname (no path, query, or fragment)", () => {
    expect(
      jobSourceDomain(
        "https://www.linkedin.com/jobs/view/123?email=a@b.co&trk=x#frag",
      ),
    ).toBe("linkedin.com");
  });

  it("lowercases and keeps subdomains other than www", () => {
    expect(jobSourceDomain("https://Jobs.Lever.co/acme/abc")).toBe(
      "jobs.lever.co",
    );
  });

  it("drops credentials in the authority", () => {
    expect(jobSourceDomain("https://user:pass@indeed.com/x")).toBe(
      "indeed.com",
    );
  });

  it("returns undefined for unparseable input", () => {
    expect(jobSourceDomain("not a url")).toBeUndefined();
    expect(jobSourceDomain("")).toBeUndefined();
  });
});

// Every new event's payload must be a closed, metadata-only key set: no text,
// names, emails, or URLs can ride along.
describe("resume / cover-letter trackers send metadata only", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {});
    captureMock.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  const lastCall = () => {
    const [event, props] = captureMock.mock.calls.at(-1) ?? [];
    return { event, keys: Object.keys(props ?? {}).sort(), props };
  };

  it("resume_created", () => {
    trackResumeCreated({ method: "scratch" });
    expect(lastCall()).toMatchObject({
      event: "resume_created",
      keys: ["method"],
    });
  });

  it("cover_letter_created", () => {
    trackCoverLetterCreated({ method: "file_import", hasLinkedResume: true });
    expect(lastCall()).toMatchObject({
      event: "cover_letter_created",
      keys: ["has_linked_resume", "method"],
    });
  });

  it("job_posting_imported omits absent optional keys", () => {
    trackJobPostingImported({
      feature: "resume_builder",
      status: "started",
      input: "paste",
    });
    expect(lastCall().keys).toEqual(["feature", "input", "status"]);

    trackJobPostingImported({
      feature: "cover_letter",
      status: "failed",
      input: "url",
      sourceDomain: "indeed.com",
      errorCode: "fetch_failed",
    });
    expect(lastCall()).toMatchObject({
      event: "job_posting_imported",
      keys: ["error_code", "feature", "input", "source_domain", "status"],
      props: { source_domain: "indeed.com" },
    });
  });

  it("exports", () => {
    trackResumeExported({ format: "pdf" });
    expect(lastCall()).toMatchObject({
      event: "resume_exported",
      keys: ["format"],
    });
    trackCoverLetterExported({ format: "docx" });
    expect(lastCall()).toMatchObject({
      event: "cover_letter_exported",
      keys: ["format"],
    });
  });

  it("ai_prompt_sent / ai_prompt_limit_reached", () => {
    trackAiPromptSent({
      feature: "resume_builder",
      mode: "chat",
      promptsUsed: 3,
      promptLimit: 20,
    });
    expect(lastCall()).toMatchObject({
      event: "ai_prompt_sent",
      keys: ["feature", "mode", "prompt_limit", "prompts_used"],
    });
    // Usage read failed: the event still goes out, without a fabricated count.
    trackAiPromptSent({
      feature: "cover_letter",
      mode: "import",
      promptLimit: 20,
    });
    expect(lastCall()).toMatchObject({
      event: "ai_prompt_sent",
      keys: ["feature", "mode", "prompt_limit"],
    });
    trackAiPromptLimitReached({
      feature: "cover_letter",
      promptLimit: 20,
      trigger: "job_import",
      reason: "blocked",
    });
    expect(lastCall()).toMatchObject({
      event: "ai_prompt_limit_reached",
      keys: ["feature", "prompt_limit", "reason", "trigger"],
    });
  });

  it("swallows a PostHog failure instead of throwing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    captureMock.mockImplementation(() => {
      throw new Error("posthog down");
    });
    expect(() => trackResumeCreated({ method: "scratch" })).not.toThrow();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

// Spec UnifyCN/mobile-app#314: Companion usage detail, same shape as mobile.
// Closed key sets: the question and answer text can never ride along.
describe("companion trackers", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {});
    captureMock.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  const lastCall = () => {
    const [event, props] = captureMock.mock.calls.at(-1) ?? [];
    return { event, keys: Object.keys(props ?? {}).sort(), props };
  };

  it("companion_message_sent carries conversation_id, turn_number and input_source", () => {
    trackCompanionMessageSent({
      messageLength: 42,
      conversationId: "conv-1",
      turnNumber: 1,
      inputSource: "starter_prompt",
    });
    expect(lastCall()).toEqual({
      event: "companion_message_sent",
      keys: ["conversation_id", "input_source", "message_length", "turn_number"],
      props: {
        message_length: 42,
        conversation_id: "conv-1",
        turn_number: 1,
        input_source: "starter_prompt",
      },
    });
  });

  it("companion_message_sent leaves turn_number out when the turn is unknown", () => {
    trackCompanionMessageSent({
      messageLength: 42,
      conversationId: "conv-1",
      turnNumber: undefined,
      inputSource: "typed",
    });
    expect(lastCall()).toEqual({
      event: "companion_message_sent",
      keys: ["conversation_id", "input_source", "message_length"],
      props: {
        message_length: 42,
        conversation_id: "conv-1",
        input_source: "typed",
      },
    });
  });

  it("companion_response_received matches mobile's shape and adds topic", () => {
    trackCompanionResponseReceived({
      queryType: "immigration",
      topic: "housing",
      hasSources: true,
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
      estimatedCostUsd: 0.0001,
      responseTimeMs: 1234,
    });
    expect(lastCall()).toEqual({
      event: "companion_response_received",
      keys: [
        "completion_tokens",
        "estimated_cost_usd",
        "has_sources",
        "prompt_tokens",
        "query_type",
        "response_time_ms",
        "topic",
        "total_tokens",
      ],
      props: {
        query_type: "immigration",
        topic: "housing",
        has_sources: true,
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
        estimated_cost_usd: 0.0001,
        response_time_ms: 1234,
      },
    });
  });

  it("companion_response_received omits topic and usage it did not get", () => {
    trackCompanionResponseReceived({
      queryType: null,
      topic: null,
      hasSources: false,
      responseTimeMs: 900,
    });
    expect(lastCall()).toEqual({
      event: "companion_response_received",
      keys: ["has_sources", "query_type", "response_time_ms"],
      // mobile sends "unknown" when the response has no queryType
      props: { query_type: "unknown", has_sources: false, response_time_ms: 900 },
    });
  });
});
