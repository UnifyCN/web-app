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
    expect(jobSourceDomain("https://user:pass@indeed.com/x")).toBe("indeed.com");
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
    expect(lastCall()).toMatchObject({ event: "resume_created", keys: ["method"] });
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
    expect(lastCall()).toMatchObject({ event: "resume_exported", keys: ["format"] });
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
    trackAiPromptLimitReached({
      feature: "cover_letter",
      promptLimit: 20,
      trigger: "job_import",
    });
    expect(lastCall()).toMatchObject({
      event: "ai_prompt_limit_reached",
      keys: ["feature", "prompt_limit", "trigger"],
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
