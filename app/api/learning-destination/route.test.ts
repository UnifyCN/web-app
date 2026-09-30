import { beforeEach, describe, expect, it, vi } from "vitest";
import { encodeLearningDestination } from "@/lib/learningDestination";

const state = vi.hoisted(() => ({ user: "test-user" as string | null, cookie: undefined as string | undefined }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => state.cookie ? { value: state.cookie } : undefined }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.user ? { id: state.user } : null } }) } }) }));
import { GET } from "./route";

const section = "/learn/9717e260-bdeb-4ee4-8d39-4159a48eb627/3d5abe49-8616-48f8-a857-b80317ddeb35";
beforeEach(() => { state.user = "test-user"; state.cookie = undefined; });

describe("mounted-navigation intent status", () => {
  it("requires authentication even independently of the proxy", async () => {
    state.user = null;
    state.cookie = encodeLearningDestination(section);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ intent: null });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("returns a stable opaque token without exposing or mutating destination state", async () => {
    state.cookie = encodeLearningDestination(section);
    const original = state.cookie;
    const response = await GET();
    const payload = await response.json();
    expect(payload).toEqual({ intent: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(JSON.stringify(payload)).not.toContain(section);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(state.cookie).toBe(original);
    expect(await (await GET()).json()).toEqual(payload);
    state.user = "other-user";
    expect(await (await GET()).json()).not.toEqual(payload);
  });
  it.each([undefined, "forged", `${Date.now() - 1}|${section}`, `${Date.now() + 1000}|//evil.test`])("returns no intent for missing, invalid or expired state", async (value) => {
    state.cookie = value;
    const response = await GET();
    expect(await response.json()).toEqual({ intent: null });
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
