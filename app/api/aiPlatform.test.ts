import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Spec UnifyCN/mobile-app#314 / ticket #318: every web call to an AI edge
// function sends `platform: "web"`, so `$ai_generation` can tell web, iOS and
// Android apart. Covers the four same-origin proxies and the three services
// that invoke an AI function straight from the browser client.

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    functions: { invoke: mocks.invoke },
  }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ functions: { invoke: mocks.invoke } }),
  getAuthUserId: async () => "user-1",
  isSupabaseConfigured: () => true,
}));

vi.mock("@/lib/sanity", () => ({
  mergeI18nOverlay: vi.fn(),
  sanityClient: { fetch: vi.fn() },
}));

import { POST as companionPOST } from "./companion/route";
import { POST as translatePOST } from "./translate/route";
import { POST as resumePOST } from "./resume/route";
import { POST as coverLetterPOST } from "./cover-letter/route";
import { explainTerm } from "@/services/highlights";
import { requestPracticeFeedback } from "@/services/learn";
import { getDailyTip } from "@/services/dailyTip";

function post(body: unknown): NextRequest {
  return new Request("http://localhost/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

/** The body sent with the one `functions.invoke` call to `fn`. */
function invokedBody(fn: string): Record<string, unknown> {
  const calls = mocks.invoke.mock.calls.filter(([name]) => name === fn);
  expect(calls).toHaveLength(1);
  return (calls[0][1] as { body: Record<string, unknown> }).body;
}

beforeEach(() => {
  mocks.invoke.mockReset();
  mocks.invoke.mockResolvedValue({ data: {}, error: null });
});

describe("AI edge-function calls send platform: 'web'", () => {
  it("rag-query (via /api/companion), keeping the legacy source tag", async () => {
    await companionPOST(post({ prompt: "Hi", conversationIdentifier: "c-1" }));
    const body = invokedBody("rag-query");
    expect(body.platform).toBe("web");
    // The deployed rag-query reads `source` until #322 ships the new one.
    expect(body.source).toBe("web");
  });

  it("translate-content (via /api/translate)", async () => {
    await translatePOST(post({ type: "post", id: 7, targetLanguage: "vi" }));
    expect(invokedBody("translate-content").platform).toBe("web");
  });

  it("resume-chat (via /api/resume), chat and import", async () => {
    await resumePOST(post({ message: "Shorter, please" }));
    expect(invokedBody("resume-chat").platform).toBe("web");
    mocks.invoke.mockClear();
    await resumePOST(post({ importText: "Jane Doe\nEngineer" }));
    expect(invokedBody("resume-chat").platform).toBe("web");
  });

  it("cover-letter-chat (via /api/cover-letter), chat and import", async () => {
    await coverLetterPOST(post({ message: "Shorter, please" }));
    expect(invokedBody("cover-letter-chat").platform).toBe("web");
    mocks.invoke.mockClear();
    await coverLetterPOST(post({ importText: "Dear hiring manager" }));
    expect(invokedBody("cover-letter-chat").platform).toBe("web");
  });

  it("explain-term", async () => {
    await explainTerm("SIN").catch(() => undefined);
    expect(invokedBody("explain-term").platform).toBe("web");
  });

  it("practice-feedback", async () => {
    await requestPracticeFeedback({
      questionText: "Q",
      userAnswer: "A",
    }).catch(() => undefined);
    expect(invokedBody("practice-feedback").platform).toBe("web");
  });

  it("get-daily-tip", async () => {
    await getDailyTip().catch(() => undefined);
    expect(invokedBody("get-daily-tip").platform).toBe("web");
  });
});
