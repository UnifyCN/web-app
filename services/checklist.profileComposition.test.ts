import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PROVINCES } from "@/lib/province";

const mocks = vi.hoisted(() => ({
  profile: { persona: "skilled_worker", arrival_date: "2028-02-01" as string | null, stage: "4" as string | null, province: "ON" as string | null },
  rows: [] as Record<string, unknown>[],
  fetch: vi.fn(),
  columns: [] as string[],
}));
vi.mock("@/lib/supabase/client", () => ({
  isSupabaseConfigured: () => true,
  getAuthUserId: async () => "profile-composition-user",
  createClient: () => ({
    from: (table: string) => {
      const data = table === "user_onboarding_profiles" ? mocks.profile
        : table === "user_tasks" ? [{ sanity_checklist_id: "national", completed: true, completed_at: "2026-10-01", dismissed_at: null }]
        : table === "custom_checklist_tasks" ? [{ id: 12, priority: "Do now", title: "Private saved task", description: "Keep this description", completed: false, completed_at: null }]
        : [];
      const reply = { data, error: null };
      const query = {
        select(columns: string) { mocks.columns.push(columns); return query; },
        eq: () => query,
        order: () => query,
        maybeSingle: async () => reply,
        then: (yes: (value: typeof reply) => unknown, no: (error: unknown) => unknown) => Promise.resolve(reply).then(yes, no),
      };
      return query;
    },
  }),
}));
vi.mock("@/lib/sanity", () => ({
  sanityClient: { fetch: (...args: unknown[]) => mocks.fetch(...args) },
  mergeI18nOverlay: (row: unknown) => row,
}));
import { getTasks } from "./checklist";

function item(id: string, province: string | string[] | null = null, extra: Record<string, unknown> = {}) {
  return { _id: id, title: id, province, description: "", longer_description: null,
    class: "do_now", class_order: 1, link_tab: null, module: null, submodule: null, ...extra };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-31T12:00:00-07:00"));
  mocks.profile = { persona: "skilled_worker", arrival_date: "2028-02-01", stage: "4", province: "ON" };
  mocks.rows = [item("national"), item("ontario", "Ontario"), item("bc", "British Columbia")];
  mocks.columns.length = 0;
  mocks.fetch.mockReset().mockImplementation(async () => mocks.rows);
});
afterEach(() => vi.useRealTimers());

it.each([
  ["2028-02-01", "4", "not_arrived"],
  ["2010-01-01", "0", "years_3_plus"],
  [null, "0", "not_arrived"],
  [null, null, "arrived_0_3_months"],
])("uses arrival %s and legacy stage %s to request %s", async (arrival, stored, expected) => {
  // False if the old cache overrides a date, or a dateless legacy stage-0 profile changes track.
  mocks.profile.arrival_date = arrival;
  mocks.profile.stage = stored;
  const tasks = await getTasks();
  expect(mocks.fetch.mock.calls[0][1].stage).toBe(expected);
  expect(mocks.columns[0].split(", ")).toEqual(expect.arrayContaining(["persona", "arrival_date", "stage", "province"]));
  expect(tasks.map(task => task.id)).toEqual(["national", "ontario", "12"]);
  expect(tasks.find(task => task.id === "national")).toMatchObject({ completed: true, completedAt: "2026-10-01" });
  expect(tasks.find(task => task.id === "12")).toMatchObject({ title: "Private saved task", description: "Keep this description", completed: false });
});

it.each(PROVINCES)("keeps national content and only %s content", async province => {
  // The CMS response is a raw published-content fixture. This checks the real client visibility rule.
  mocks.profile.province = province;
  mocks.rows = [item("national"), ...PROVINCES.map(name => item(name, name))];
  const tasks = await getTasks();
  expect(tasks.filter(task => !task.isCustom).map(task => task.id)).toEqual(["national", province]);
});

it("keeps list tags, national empty tags and legacy province aliases", async () => {
  mocks.rows = [item("national"), item("empty", []), item("match-list", ["BC", "ON"]),
    item("match-code", "ON"), item("other-list", ["BC"]), item("unknown", "Other")];
  const tasks = await getTasks();
  expect(tasks.filter(task => !task.isCustom).map(task => task.id)).toEqual(["national", "empty", "match-list", "match-code"]);
});

it("shows only national content when the stored province is unknown", async () => {
  mocks.profile.province = "constructor";
  const tasks = await getTasks();
  expect(tasks.filter(task => !task.isCustom).map(task => task.id)).toEqual(["national"]);
});

it("keeps matching Learn targets and drops targets for another province", async () => {
  mocks.rows = [item("national"),
    item("other-module", null, { module: { _id: "bc-module", province: "British Columbia" } }),
    item("matching-module", null, { module: { _id: "on-module", province: "Ontario" } }),
    item("other-submodule", null, { submodule: { _id: "bc-lesson", moduleId: "bc-module", moduleProvince: "British Columbia" } }),
    item("matching-submodule", null, { submodule: { _id: "on-lesson", moduleId: "on-module", moduleProvince: "Ontario" } }),
    item("tab", null, { link_tab: "community", module: { _id: "bc-module", province: "British Columbia" } })];
  const tasks = await getTasks();
  const links = Object.fromEntries(tasks.filter(task => !task.isCustom).map(task => [task.id, task.learnHowHref]));
  expect(links).toEqual({ national: "/learn", "other-module": "/learn", "matching-module": "/learn/on-module",
    "other-submodule": "/learn", "matching-submodule": "/learn/on-module/on-lesson", tab: "/community" });
});

it("applies a newly saved profile without changing retained progress", async () => {
  const before = await getTasks();
  mocks.profile.province = "BC";
  mocks.profile.arrival_date = "2010-01-01";
  const after = await getTasks();
  expect(mocks.fetch.mock.calls.map(call => call[1].stage)).toEqual(["not_arrived", "years_3_plus"]);
  expect(before.filter(task => !task.isCustom).map(task => task.id)).toEqual(["national", "ontario"]);
  expect(after.filter(task => !task.isCustom).map(task => task.id)).toEqual(["national", "bc"]);
  for (const id of ["national", "12"]) expect(after.find(task => task.id === id)).toEqual(before.find(task => task.id === id));
});
