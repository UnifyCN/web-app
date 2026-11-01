// @vitest-environment jsdom
import { useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  province: "British Columbia", account: "", language: "en" as "en" | "vi",
  actions: [] as Record<string, unknown>[], reads: 0,
  holdProvince: 0, releases: [] as (() => void)[], completedHeld: 0,
  holdProfile: false, releaseProfile: null as (() => void) | null,
}));
const modules = [
  { _id: "national", title: "National", province: null, submodules: [], lessonIds: ["national-lesson"] },
  { _id: "bc", title: "BC", province: "British Columbia", submodules: [], lessonIds: ["bc-lesson"] },
  { _id: "on", title: "Ontario", province: "Ontario", submodules: [], lessonIds: ["on-lesson"] },
];
vi.mock("@/hooks/useAuthUser", () => ({ useAuthUser: () => ({ data: { id: state.account }, isPending: false }) }));
vi.mock("@/hooks/useLanguage", () => ({ useLanguage: () => ({ currentLanguage: state.language }) }));
vi.mock("@/lib/analytics", () => ({ trackCompanionActionResult: () => {} }));
vi.mock("@/services/profile", () => ({ getCurrentUser: async () => {
  const province = state.province;
  if (state.holdProfile) {
    state.holdProfile = false;
    await new Promise<void>(resolve => { state.releaseProfile = resolve; });
  }
  return { id: state.account, onboarding: { province } };
} }));
vi.mock("@/lib/supabase/client", () => ({
  isSupabaseConfigured: () => true, getAuthUserId: async () => state.account,
  createClient: () => ({ from: (table: string) => {
    const data = table === "learn_progress"
      ? ["national", "bc", "on"].map(module_id => ({ module_id, status: "in_progress", updated_at: "2026-10-31" }))
      : [];
    const reply = { data, error: null };
    const query = {
      select: () => query, eq: () => query, order: () => query,
      maybeSingle: async () => {
        const province = state.province;
        state.reads++;
        if (state.holdProvince > 0) {
          state.holdProvince--;
          await new Promise<void>(resolve => { state.releases.push(resolve); });
          state.completedHeld++;
        }
        return { data: { province }, error: null };
      },
      then: (yes: (value: typeof reply) => unknown, no: (error: unknown) => unknown) => Promise.resolve(reply).then(yes, no),
    };
    return query;
  } }),
}));
vi.mock("@/lib/sanity", () => ({
  isSanityConfigured: () => true, MODULES_LIST_QUERY: "modules", MODULE_DETAIL_QUERY: "module",
  LESSON_DETAIL_QUERY: "", PRACTICES_BY_SUBMODULE_QUERY: "", LESSON_QUIZ_QUERY: "",
  mergeI18nOverlay: (row: unknown) => row,
  sanityClient: { fetch: async () => modules },
}));

import { useModules, useLearningProgressSummary } from "./useLearn";
import { useCurrentUser } from "./useProfile";
import { useTaskActionStore } from "./useTaskActions";
import { getModules, getLearningProgressSummary } from "@/services/learn";
import { noteAccount } from "@/lib/accountSession";

function LearnViews() {
  const list = useModules();
  const summary = useLearningProgressSummary();
  return <><output data-testid="modules">{list.data?.map(row => row._id).join(",") ?? "loading"}</output>
    <output data-testid="summary">{summary.data?.map(row => row.moduleId).join(",") ?? "loading"}</output></>;
}
function ProfileView() {
  const query = useCurrentUser();
  return <output data-testid="province">{query.data?.onboarding?.province ?? "loading"}</output>;
}
function RouteProbe({ profile = false }: { profile?: boolean }) {
  const [learn, setLearn] = useState(true);
  const store = useTaskActionStore("companion");
  return <><button onClick={() => setLearn(!learn)}>Navigate</button>
    <button onClick={() => void store!.applyOperation("province-review",
      { type: "profile.update", field: "province", value: "Ontario", expected_revision: 1 },
      { kind: "approved_proposal", proposal_id: "reviewed-province", proposal_revision: 1 })}>Save province</button>
    <button onClick={() => void store!.undo("province-review", "saved-province")}>Undo province</button>
    {profile && <ProfileView/>}{learn ? <LearnViews/> : <span>Companion</span>}</>;
}
const clients: QueryClient[] = [];
let accountCounter = 0;
function mount(profile = false) {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: false, gcTime: Infinity } } });
  clients.push(qc);
  const view = render(<QueryClientProvider client={qc}><RouteProbe profile={profile}/></QueryClientProvider>);
  return { qc, ...view };
}
async function shows(province: "bc" | "on") {
  await waitFor(() => {
    expect(screen.getByTestId("modules").textContent).toBe("national," + province);
    expect(screen.getByTestId("summary").textContent).toBe("national," + province);
  });
}
beforeEach(() => {
  state.account = "learn-refresh-owner-" + ++accountCounter;
  noteAccount(state.account);
  state.province = "British Columbia"; state.language = "en"; state.actions = []; state.reads = 0;
  state.holdProvince = 0; state.releases = []; state.completedHeld = 0;
  state.holdProfile = false; state.releaseProfile = null;
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    expect(url).toBe("/api/companion/actions");
    const body = JSON.parse(String(init.body)) as { action: string; operation_id: string };
    expect(["apply", "undo"]).toContain(body.action);
    state.actions.push(body);
    const before = state.province;
    state.province = body.action === "undo" ? "British Columbia" : "Ontario";
    return { status: 200, json: async () => ({ replayed: false, receipt: {
      operation_id: body.operation_id, operation_type: "profile.update", created_at: "2026-10-31T12:00:00Z",
      kind: body.action === "undo" ? "undo" : "change", undo_of: body.action === "undo" ? "saved-province" : null,
      task_ref: null, before_revision: 1, after_revision: 2, undone_by: null, current: true, undoable: body.action !== "undo",
      profile: { field: "province", before, after: state.province },
    } }) };
  });
});
afterEach(() => {
  state.releases.forEach(release => release()); state.releaseProfile?.();
  cleanup(); clients.splice(0).forEach(qc => qc.clear()); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

it.each(["en", "vi"] as const)("refreshes inactive Learn content and summary after save, including %s caches", async language => {
  const view = mount(); await shows("bc");
  if (language !== "en") {
    await view.qc.prefetchQuery({ queryKey: ["modules", language], queryFn: () => getModules(language) });
    await view.qc.prefetchQuery({ queryKey: ["learning-progress", language], queryFn: () => getLearningProgressSummary(language) });
  }
  fireEvent.click(screen.getByText("Navigate"));
  await act(async () => { fireEvent.click(screen.getByText("Save province")); });
  expect(state.actions).toHaveLength(1);
  state.language = language;
  fireEvent.click(screen.getByText("Navigate"));
  await shows("on");
  expect(state.actions).toHaveLength(1);
});

it("refreshes both Learn views after a reviewed province Undo", async () => {
  mount(); await shows("bc");
  await act(async () => { fireEvent.click(screen.getByText("Save province")); });
  await shows("on");
  fireEvent.click(screen.getByText("Navigate"));
  await act(async () => { fireEvent.click(screen.getByText("Undo province")); });
  fireEvent.click(screen.getByText("Navigate")); await shows("bc");
  expect(state.actions.map(body => body.action)).toEqual(["apply", "undo"]);
});

it("ignores old pending module and summary results after a province save", async () => {
  state.holdProvince = 2; mount();
  await waitFor(() => expect(state.releases).toHaveLength(2));
  await act(async () => { fireEvent.click(screen.getByText("Save province")); });
  await shows("on");
  await act(async () => { state.releases.forEach(release => release()); });
  await waitFor(() => expect(state.completedHeld).toBe(2));
  await shows("on"); expect(state.actions).toHaveLength(1);
});

it("ignores an older initial profile response after the confirmed save", async () => {
  state.holdProfile = true; mount(true);
  await waitFor(() => expect(state.releaseProfile).not.toBeNull());
  await act(async () => { fireEvent.click(screen.getByText("Save province")); });
  await waitFor(() => expect(screen.getByTestId("province").textContent).toBe("Ontario"));
  await act(async () => { state.releaseProfile?.(); });
  expect(screen.getByTestId("province").textContent).toBe("Ontario");
  expect(state.actions).toHaveLength(1);
});

it.each([false, true])("rechecks ownership after pending cancellation; account replacement: %s", async replacement => {
  const view = mount(); await shows("bc"); fireEvent.click(screen.getByText("Navigate"));
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const cancel = view.qc.cancelQueries.bind(view.qc);
  vi.spyOn(view.qc, "cancelQueries").mockImplementation((filters, options) => {
    const finished = cancel(filters, options);
    return filters?.queryKey?.[0] === "modules" ? finished.then(() => held) : finished;
  });
  await act(async () => { fireEvent.click(screen.getByText("Save province")); });
  expect(state.actions).toHaveLength(1);
  if (replacement) {
    state.account += "-replacement"; state.province = "British Columbia";
    noteAccount(state.account);
    view.qc.setQueryData(["modules", "en"], [{ _id: "fresh-replacement-cache" }]);
  } else noteAccount(state.account);
  await act(async () => { release(); });
  expect(view.qc.getQueryState(["modules", "en"])?.isInvalidated).toBe(!replacement);
  if (replacement) expect(view.qc.getQueryData(["modules", "en"])).toEqual([{ _id: "fresh-replacement-cache" }]);
  else { fireEvent.click(screen.getByText("Navigate")); await shows("on"); }
});
