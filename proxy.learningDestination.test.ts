import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  allowedLearningDestination, encodeLearningDestination, readLearningDestination,
  LEARNING_DESTINATION_COOKIE as COOKIE, LEARNING_DESTINATION_TTL_SECONDS as TTL,
} from "./lib/learningDestination";

const state = vi.hoisted(() => ({ signedIn: false, consented: false, onboarded: false, queryError: false }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, options: { cookies: { setAll: (cookies: { name: string; value: string }[]) => void } }) => ({
    auth: { getUser: async () => {
      options.cookies.setAll([{ name: "refreshed-session", value: "test-session" }]);
      return { data: { user: state.signedIn ? { id: "test-user" } : null } };
    } },
    from: (table: string) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({
      error: state.queryError ? new Error("test outage") : null,
      data: table === "users"
        ? { privacy_policy_accepted_at: state.consented ? "accepted" : null }
        : { onboarding_completed: state.onboarded },
    }) }) }) }),
  }),
}));
import { proxy } from "./proxy";

const PR = "/learn/9717e260-bdeb-4ee4-8d39-4159a48eb627/3d5abe49-8616-48f8-a857-b80317ddeb35";
const TAX = "/learn/4c79ebb5-b03a-47aa-862e-6d0853eba7d4/b7988f8b-6105-4a26-ade1-6df5864f8ee6";
const HEALTH = "/learn/1f43061d-0062-4ea5-bd82-6b25e8ee5a55/9882f55c-6191-4c4f-85f3-8cf4e1873355";
const NOW = 1790800000000;

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-test-key");
  vi.spyOn(Date, "now").mockReturnValue(NOW);
  Object.assign(state, { signedIn: false, consented: false, onboarded: false, queryError: false });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function request(path: string, pending?: string, extraHeaders: Record<string, string> = {}) {
  return new NextRequest(`https://app.unifysocial.ca${path}`, {
    headers: { ...(pending ? { cookie: `${COOKIE}=${pending}` } : {}), ...extraHeaders },
  });
}
function location(response: Awaited<ReturnType<typeof proxy>>) {
  return response.headers.get("location")?.replace("https://app.unifysocial.ca", "");
}

describe("learning destination validation", () => {
  it.each([PR, TAX, HEALTH])("accepts only a verified published section: %s", (path) => {
    expect(allowedLearningDestination(path)).toBe(path);
    expect(readLearningDestination(encodeLearningDestination(path))).toBe(path);
  });
  it.each(["https://evil.test", "//evil.test", "/\\evil.test", PR + "?next=//evil.test", PR + "/../home", PR.replace("/learn/", "/learn/%2f"), "/home", "/learn", "/learn/unknown", PR + "\n"])("rejects unsafe or unsupported values: %s", (path) => {
    expect(allowedLearningDestination(path)).toBeNull();
    expect(readLearningDestination(`${NOW + 1000}|${path}`)).toBeNull();
  });
  it.each([`${NOW}|${PR}`, `${NOW - 1}|${PR}`, `${NOW + TTL * 1000 + 1}|${PR}`, `NaN|${PR}`, `${NOW + 1000}|${PR}|extra`, "malformed"])("rejects expired, overlong or malformed state", (value) => {
    expect(readLearningDestination(value)).toBeNull();
  });
});

describe("proxy learning destination flow", () => {
  it.each([PR, TAX, HEALTH])("sends signed-out readers through welcome with short-lived httpOnly state", async (path) => {
    vi.stubEnv("NODE_ENV", "production");
    const response = await proxy(request(path));
    expect(location(response)).toBe("/welcome");
    const cookie = response.cookies.get(COOKIE)!;
    expect(readLearningDestination(cookie.value)).toBe(path);
    expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: TTL });
    expect(response.cookies.get("refreshed-session")?.value).toBe("test-session");
  });

  it("retains the section across signup, verification, consent and onboarding, then consumes it once", async () => {
    const entry = await proxy(request(PR + "?utm_source=test"));
    const pending = entry.cookies.get(COOKIE)!.value;
    for (const path of ["/welcome", "/welcome?step=4", "/login", "/signup", "/verify-email", "/auth/callback?code=test"]) {
      const response = await proxy(request(path, pending));
      expect(response.cookies.get(COOKIE)).toBeUndefined();
      expect(location(response)).toBeUndefined();
    }
    state.signedIn = true;
    expect(location(await proxy(request("/login", pending)))).toBe("/home");
    expect(location(await proxy(request("/home", pending)))).toBe("/before-you-continue");
    expect(location(await proxy(request("/before-you-continue", pending)))).toBeUndefined();
    state.consented = true;
    expect(location(await proxy(request("/before-you-continue", pending)))).toBe("/home");
    expect(location(await proxy(request("/home", pending)))).toBe("/onboarding");
    expect(location(await proxy(request("/onboarding", pending)))).toBeUndefined();
    // Saving onboarding goes through the protected API without losing intent.
    expect((await proxy(request("/api/onboarding-profile", pending))).cookies.get(COOKIE)).toBeUndefined();
    state.onboarded = true;
    expect(location(await proxy(request("/onboarding", pending)))).toBe("/home");
    const completion = await proxy(request("/home?code=must-not-forward", pending));
    expect(location(completion)).toBe(PR);
    expect(completion.cookies.get(COOKIE)?.value).toBe("");
    expect(completion.cookies.get("refreshed-session")?.value).toBe("test-session");
    expect(location(await proxy(request("/home")))).toBeUndefined();
  });

  it("returns an existing, fully set-up account to the section after email login", async () => {
    state.signedIn = state.consented = state.onboarded = true;
    const pending = encodeLearningDestination(TAX);
    expect(location(await proxy(request("/login", pending)))).toBe("/home");
    expect(location(await proxy(request("/home", pending)))).toBe(TAX);
  });

  it("preserves direct links for authenticated readers and drops an older destination", async () => {
    state.signedIn = state.consented = state.onboarded = true;
    const response = await proxy(request(HEALTH, encodeLearningDestination(PR)));
    expect(location(response)).toBeUndefined();
    expect(response.cookies.get(COOKIE)?.value).toBe("");
  });

  it.each(["/before-you-continue", "/onboarding"])("remembers the requested section when an authenticated reader needs %s", async (gate) => {
    state.signedIn = true;
    state.consented = gate === "/onboarding";
    const response = await proxy(request(TAX));
    expect(location(response)).toBe(gate);
    expect(readLearningDestination(response.cookies.get(COOKIE)?.value)).toBe(TAX);
  });

  it.each(["/", "/community"])("cancels abandoned intent on a fresh app entry: %s", async (path) => {
    const response = await proxy(request(path, encodeLearningDestination(PR)));
    expect(response.cookies.get(COOKIE)?.value).toBe("");
  });

  it("does not consume or replace intent on prefetch", async () => {
    state.signedIn = state.consented = state.onboarded = true;
    const response = await proxy(request("/home", encodeLearningDestination(PR), { "next-router-prefetch": "1" }));
    expect(location(response)).toBeUndefined();
    expect(response.cookies.get(COOKIE)).toBeUndefined();
  });

  it("keeps the password-recovery gate ahead of learning resumption", async () => {
    state.signedIn = state.consented = state.onboarded = true;
    const pending = encodeLearningDestination(PR);
    const recoveryHeaders = { cookie: `${COOKIE}=${pending}; unify_recovery_pending=test-user` };
    const interrupted = await proxy(request(TAX, pending, recoveryHeaders));
    expect(location(interrupted)).toBe("/reset-password");
    expect(readLearningDestination(interrupted.cookies.get(COOKIE)?.value)).toBe(TAX);
    const reset = await proxy(request("/reset-password", pending, recoveryHeaders));
    expect(location(reset)).toBeUndefined();
    expect(reset.cookies.get(COOKIE)).toBeUndefined();
    expect(location(await proxy(request("/home", pending, recoveryHeaders)))).toBe("/reset-password");
  });

  it("replaces an abandoned destination with a new explicit CTA", async () => {
    const response = await proxy(request(TAX, encodeLearningDestination(PR)));
    expect(readLearningDestination(response.cookies.get(COOKIE)?.value)).toBe(TAX);
  });

  it.each([`${NOW}|${PR}`, `${NOW + 1000}|//evil.test`])("forgets expired or forged state without redirecting", async (pending) => {
    state.signedIn = state.consented = state.onboarded = true;
    const response = await proxy(request("/home", pending));
    expect(location(response)).toBeUndefined();
    expect(response.cookies.get(COOKIE)?.value).toBe("");
  });

  it("keeps the existing gate-query error behavior without consuming intent", async () => {
    state.signedIn = true;
    state.queryError = true;
    const response = await proxy(request("/home", encodeLearningDestination(PR)));
    expect(location(response)).toBeUndefined();
    expect(response.cookies.get(COOKIE)).toBeUndefined();
  });
});
