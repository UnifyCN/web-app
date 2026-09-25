import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const URL = "https://app.test/api/cron/sentry-snapshot";
const SECRET = "test-cron-secret";

function request(authorization?: string): NextRequest {
  const headers = new Headers();
  if (authorization !== undefined) headers.set("authorization", authorization);
  return new NextRequest(URL, { headers });
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  fetchMock.mockReset();
});

describe("GET /api/cron/sentry-snapshot auth", () => {
  it("returns 500 and logs when CRON_SECRET is unset", async () => {
    vi.stubEnv("CRON_SECRET", undefined);
    const res = await GET(request(`Bearer ${SECRET}`));
    expect(res.status).toBe(500);
    expect(console.error).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 500 when CRON_SECRET is empty", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const res = await GET(request("Bearer "));
    expect(res.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never accepts "Bearer undefined" when CRON_SECRET is unset', async () => {
    vi.stubEnv("CRON_SECRET", undefined);
    const res = await GET(request("Bearer undefined"));
    expect(res.status).not.toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 401 without an Authorization header", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    const res = await GET(request());
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 401 for a wrong secret", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    const res = await GET(request("Bearer wrong"));
    expect(res.status).toBe(401);
  });

  it("returns 401 for a same-length wrong secret", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    const wrong = "x".repeat(SECRET.length);
    const res = await GET(request(`Bearer ${wrong}`));
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("proceeds to Sentry + PostHog with the correct secret", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("SENTRY_API_TOKEN", "sentry-token");
    vi.stubEnv("POSTHOG_PROJECT_API_KEY", "phc_test");
    fetchMock.mockImplementation(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/issues/")) {
        return new Response("[]", { headers: { "X-Hits": "7" } });
      }
      if (url.includes("/stats/")) {
        return Response.json([
          [1, 2],
          [2, 3],
        ]);
      }
      if (url.endsWith("/capture/")) return new Response("{}");
      throw new Error(`unexpected fetch ${url}`);
    });

    const res = await GET(request(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      open_issue_count: 7,
      errors_24h: 5,
    });

    const capture = fetchMock.mock.calls.find(([u]) =>
      String(u).endsWith("/capture/"),
    );
    expect(capture).toBeDefined();
    const body = JSON.parse((capture![1] as RequestInit).body as string);
    expect(body.event).toBe("sentry_snapshot");
    expect(body.properties).toMatchObject({
      open_issue_count: 7,
      errors_24h: 5,
    });
  });
});
