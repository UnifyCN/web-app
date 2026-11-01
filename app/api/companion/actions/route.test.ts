import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The same-origin proxy for companion-actions (mobile-app#361). The browser
// client needs the function's exact status codes and JSON bodies (409 conflict
// detail, 426 version range, 503 retry hint) to show the true outcome, and a
// failure to reach the function must read as an unknown outcome (5xx), never as
// a refusal. The function itself is proven in supabase/tests/companion-actions.

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  user: { id: "user-1" } as { id: string } | null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mocks.user } }) },
    functions: { invoke: mocks.invoke },
  }),
}));

import { POST } from "./route";

function post(body: unknown): NextRequest {
  return new Request("http://localhost/api/companion/actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as unknown as NextRequest;
}

/** A FunctionsHttpError as supabase-js reports a non-2xx function reply. */
function httpError(status: number, body: unknown, headers: HeadersInit = {}) {
  return {
    data: null,
    error: Object.assign(
      new Error("Edge Function returned a non-2xx status code"),
      {
        context: new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json", ...headers },
        }),
      },
    ),
  };
}

const read = {
  contract_version: 1,
  client: { platform: "web" },
  action: "read",
};

beforeEach(() => {
  mocks.invoke.mockReset();
  mocks.user = { id: "user-1" };
});

describe("POST /api/companion/actions", () => {
  it("forwards the body unchanged to companion-actions only, and returns its reply", async () => {
    mocks.invoke.mockResolvedValue({
      data: { contract_version: 1, tasks: [] },
      error: null,
    });
    const res = await POST(post(read));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ contract_version: 1, tasks: [] });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.invoke).toHaveBeenCalledWith("companion-actions", {
      body: read,
    });
  });

  it("refuses a signed-out request without calling the function", async () => {
    mocks.user = null;
    const res = await POST(post(read));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("passes conflict detail, version ranges and retry hints through verbatim", async () => {
    const conflict = {
      error: "revision_conflict",
      reason: "revision_conflict",
      detail: { task_ref: "sanity:sin", expected: 1, actual: 2 },
    };
    mocks.invoke.mockResolvedValueOnce(httpError(409, conflict));
    let res = await POST(post(read));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual(conflict);

    mocks.invoke.mockResolvedValueOnce(
      httpError(426, {
        error: "unsupported_contract_version",
        supported: { min: 1, max: 1 },
      }),
    );
    res = await POST(post(read));
    expect(res.status).toBe(426);
    expect((await res.json()).supported).toEqual({ min: 1, max: 1 });

    mocks.invoke.mockResolvedValueOnce(
      httpError(503, { error: "operation_in_flight" }, { "retry-after": "1" }),
    );
    res = await POST(post(read));
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("1");
    expect(await res.json()).toEqual({ error: "operation_in_flight" });
  });

  it("an unreachable function is a 5xx (unknown outcome), never a refusal", async () => {
    mocks.invoke.mockResolvedValue({
      data: null,
      error: new Error("Failed to send a request to the Edge Function"),
    });
    const res = await POST(post(read));
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(await res.json()).toEqual({ error: "upstream_unreachable" });
  });

  it("refuses malformed JSON before calling the function", async () => {
    const res = await POST(post("{not json"));
    expect(res.status).toBe(400);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});
