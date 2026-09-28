import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Per-table usage rows the mocked Supabase client returns.
const usage: Record<string, { message_count: number; last_message_at: string } | null> = {};
const tablesRead: string[] = [];

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    from: (table: string) => {
      tablesRead.push(table);
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: usage[table] ?? null, error: null }),
      };
      return chain;
    },
  }),
}));

const { POST: resumePOST } = await import("@/app/api/resume/job-posting/route");
const { POST: coverLetterPOST } = await import("@/app/api/cover-letter/job-posting/route");

const PASTE =
  "Customer Service Representative\nWe are hiring a friendly, bilingual representative to help customers in our Surrey store.";

function req(path: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    body: JSON.stringify({ text: PASTE }),
    headers: { "content-type": "application/json" },
  });
}

const now = () => new Date().toISOString();

beforeEach(() => {
  for (const k of Object.keys(usage)) delete usage[k];
  tablesRead.length = 0;
});

afterEach(() => vi.clearAllMocks());

describe("job-posting quota gate", () => {
  it("cover-letter import checks the cover-letter quota, not the resume quota", async () => {
    // The reported bug: resume quota used up, cover letter has 19 left.
    usage.resume_usage = { message_count: 20, last_message_at: now() };
    usage.cover_letter_usage = { message_count: 1, last_message_at: now() };

    const res = await coverLetterPOST(req("/api/cover-letter/job-posting"));
    expect(res.status).toBe(200);
    expect(tablesRead).toEqual(["cover_letter_usage"]);
  });

  it("cover-letter import is blocked when the cover-letter quota is used up", async () => {
    usage.resume_usage = { message_count: 0, last_message_at: now() };
    usage.cover_letter_usage = { message_count: 20, last_message_at: now() };

    const res = await coverLetterPOST(req("/api/cover-letter/job-posting"));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.code).toBe("daily_limit_reached");
    expect(body.error).toMatch(/cover-letter/);
  });

  it("resume import still checks the resume quota", async () => {
    usage.resume_usage = { message_count: 20, last_message_at: now() };
    usage.cover_letter_usage = { message_count: 0, last_message_at: now() };

    const res = await resumePOST(req("/api/resume/job-posting"));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toMatch(/resume/);
    expect(tablesRead).toEqual(["resume_usage"]);
  });

  it("yesterday's usage doesn't count (UTC-day rollover)", async () => {
    usage.cover_letter_usage = {
      message_count: 20,
      last_message_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    };
    const res = await coverLetterPOST(req("/api/cover-letter/job-posting"));
    expect(res.status).toBe(200);
  });
});
