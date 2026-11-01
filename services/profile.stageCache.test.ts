import { afterEach, beforeEach, expect, it, vi } from "vitest";

interface ProfileRow {
  id: string;
  persona: string;
  province: string;
  arrival_date: string | null;
  stage: string | null;
}
interface CacheWrite {
  filters: Record<string, string>;
  stage: string | null;
  applied: boolean;
}
const state = vi.hoisted(() => ({
  row: {} as ProfileRow,
  writes: [] as CacheWrite[],
  request: vi.fn<typeof fetch>(),
  holdUser: null as Promise<void> | null,
  captured: null as (() => void) | null,
  patchSeen: null as (() => void) | null,
  stages: [] as string[],
}));

vi.mock("@/lib/supabase/client", async () => {
  const sdk = await import("@supabase/supabase-js");
  // The installed SDK builds the real PostgREST request. This fetch never
  // leaves the process. The fixture below models row predicates, not RLS.
  const api = sdk.createClient("http://127.0.0.1:59481", "synthetic-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (...args) => state.request(...args) },
  });
  return {
    isSupabaseConfigured: () => true,
    getAuthUserId: async () => "stage-cache-owner",
    createClient: () => ({
      from: api.from.bind(api),
      auth: { getSession: async () => ({ data: { session: { user: { id: "stage-cache-owner" } } } }) },
    }),
  };
});
vi.mock("@/lib/sanity", () => ({
  MODULES_LIST_QUERY: "", isSanityConfigured: () => false,
  mergeI18nOverlay: (row: unknown) => row,
  sanityClient: { fetch: async (_query: string, args: { stage: string }) => {
    state.stages.push(args.stage);
    return [];
  } },
}));

import { getCurrentUser } from "./profile";
import { getTasks } from "./checklist";
import { needsArrivalPrompt } from "@/lib/onboarding/arrivalPrompt";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-31T12:00:00-07:00"));
  state.row = { id: "stage-cache-owner", persona: "skilled_worker", province: "Ontario", arrival_date: "2026-07-31", stage: "1" };
  state.writes = []; state.stages = []; state.holdUser = null; state.captured = null; state.patchSeen = null;
  state.request.mockReset().mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    expect(url.origin).toBe("http://127.0.0.1:59481");
    const table = url.pathname.split("/").at(-1);
    const method = init?.method ?? "GET";
    if (method === "HEAD") return new Response(null, { status: 200, headers: { "content-range": "*/0" } });
    if (method === "PATCH") {
      expect(table).toBe("user_onboarding_profiles");
      const patch = JSON.parse(String(init?.body)) as { stage: string | null };
      const filters = Object.fromEntries(url.searchParams);
      const applied = Object.entries(filters).every(([key, filter]) => {
        const value = state.row[key as keyof ProfileRow];
        return filter === "is.null" ? value === null : value !== null && filter.startsWith("eq.") && String(value) === filter.slice(3);
      });
      state.writes.push({ filters, stage: patch.stage, applied });
      if (applied) state.row.stage = patch.stage;
      state.patchSeen?.();
      return Response.json([]);
    }
    if (table === "users") {
      if (state.holdUser) await state.holdUser;
      return Response.json([{ id: "stage-cache-owner", username: "stage-cache-test", permissions: null }]);
    }
    if (table === "user_onboarding_profiles") {
      const snapshot = { ...state.row };
      state.captured?.();
      return Response.json([snapshot]);
    }
    return Response.json([]);
  });
});
afterEach(() => vi.useRealTimers());

function nextPatch() {
  return new Promise<void>(resolve => { state.patchSeen = resolve; });
}
async function pendingProfileRead() {
  let release!: () => void;
  state.holdUser = new Promise<void>(resolve => { release = resolve; });
  const captured = new Promise<void>(resolve => { state.captured = resolve; });
  const finished = getCurrentUser();
  await captured;
  return { release, finished };
}

it("updates an unchanged row through the installed SDK's conditional filters", async () => {
  const patch = nextPatch();
  expect((await getCurrentUser())?.onboarding?.stage).toBe(2);
  await patch;
  expect(state.row.stage).toBe("2");
  expect(state.writes).toEqual([{ filters: { id: "eq.stage-cache-owner", arrival_date: "eq.2026-07-31", stage: "eq.1" }, stage: "2", applied: true }]);
});

it.each([
  { arrival: "2026-07-31", stored: null, expected: "2", field: "stage" },
  { arrival: null, stored: "2", expected: null, field: "arrival_date" },
])("uses a null-safe $field predicate and still repairs an unchanged cache", async ({ arrival, stored, expected, field }) => {
  state.row.arrival_date = arrival; state.row.stage = stored;
  const patch = nextPatch();
  await getCurrentUser(); await patch;
  expect(state.row.stage).toBe(expected);
  expect(state.writes[0].filters[field]).toBe("is.null");
  expect(state.writes[0].applied).toBe(true);
});

it("keeps the restored legacy track and arrival prompt after a delayed old read", async () => {
  // The supported profile Undo restores the old null arrival and stage 0.
  // Real database Undo remains covered separately by the service suite.
  const pending = await pendingProfileRead();
  state.row.arrival_date = null; state.row.stage = "0";
  await getTasks();
  expect(state.stages).toEqual(["not_arrived"]);
  const patch = nextPatch();
  pending.release(); await pending.finished; await patch;
  const fresh = await getCurrentUser(); await getTasks();
  expect(state.writes[0].applied).toBe(false);
  expect(state.row).toMatchObject({ arrival_date: null, stage: "0" });
  expect(fresh?.onboarding?.stage).toBe(0);
  expect(needsArrivalPrompt(fresh?.onboarding ?? null)).toBe(true);
  expect(state.stages).toEqual(["not_arrived", "not_arrived"]);
});

it("does not overwrite a changed arrival date when the stored stage is equal", async () => {
  const pending = await pendingProfileRead();
  state.row.arrival_date = "2026-09-01";
  const patch = nextPatch();
  pending.release(); await pending.finished; await patch;
  expect(state.writes[0].applied).toBe(false);
  expect(state.row).toMatchObject({ arrival_date: "2026-09-01", stage: "1" });
});

it("does not write an older cache snapshot after another stage repair", async () => {
  const pending = await pendingProfileRead();
  state.row.stage = "2";
  const patch = nextPatch();
  pending.release(); await pending.finished; await patch;
  expect(state.writes[0].applied).toBe(false);
  expect(state.row.stage).toBe("2");
});

it("keeps an untouched dateless stage-0 profile without a cache write", async () => {
  state.row.arrival_date = null; state.row.stage = "0";
  const profile = await getCurrentUser();
  expect(profile?.onboarding?.stage).toBe(0);
  expect(needsArrivalPrompt(profile?.onboarding ?? null)).toBe(true);
  expect(state.writes).toEqual([]);
});
