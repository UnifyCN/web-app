// @vitest-environment jsdom
//
// Mounted acceptance of settlement plans on web (mobile-app#364, direction B) against
// the real local stack: the real Companion page, send hook, plan entry, plan cards and
// overlay drawer send their /api/companion/actions requests, which this test forwards
// (as the same-origin proxy does) to the real companion-actions edge function with the
// signed-in synthetic account's real JWT. The function writes through the real
// migrations to a real Postgres with RLS. Conversations and messages are saved to the
// same database with the user's JWT (PostgREST). Only the AI answer (with the typed
// plan suggestion rag-query returns) and the Checklist content read are stand-ins.
//
// Runs only when ACTIONS_API_URL, ACTIONS_ANON_KEY and ACTIONS_SERVICE_ROLE_KEY point at
// the disposable 127.0.0.1 stack (supabase/tests/companion-actions/run.sh, ACTIONS_KEEP=1).
import { useSyncExternalStore } from "react";
import { execFileSync } from "node:child_process";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { createInstance } from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import en from "@/lib/i18n/locales/en/translation.json";
import { newQueryClient } from "../tasks/taskActionsTestHarness";
import type { ChecklistTask } from "@/types";

const API_URL = process.env.ACTIONS_API_URL ?? "";
const ANON_KEY = process.env.ACTIONS_ANON_KEY ?? "";
const SERVICE_KEY = process.env.ACTIONS_SERVICE_ROLE_KEY ?? "";
const enabled = /^http:\/\/127\.0\.0\.1:\d+$/.test(API_URL) && Boolean(ANON_KEY && SERVICE_KEY);
// The retry-review case installs a test-only write fault in the named local database
// container. There is no default container selection.
const DB_CONTAINER = process.env.ACTIONS_DB_CONTAINER?.trim() ?? "";
const realFetch = globalThis.fetch;
const jwts = new Map<string, string>();

// ---------------------------------------------------------------- stand-ins
const account = {
  id: null as string | null,
  listeners: new Set<() => void>(),
  set(id: string | null) {
    this.id = id;
    for (const l of this.listeners) l();
  },
};
vi.mock("@/hooks/useAuthUser", () => ({
  AUTH_USER_KEY: ["auth-user"],
  useAuthUser: () => {
    const id = useSyncExternalStore(
      (l) => {
        account.listeners.add(l);
        return () => account.listeners.delete(l);
      },
      () => account.id,
    );
    return { data: id ? { id } : null, isPending: false };
  },
}));
vi.mock("@/hooks/useLanguage", () => ({ useLanguage: () => ({ currentLanguage: "en" }) }));
const capture = vi.fn();
let checklistFixture: ChecklistTask[] = [];
vi.mock("@/lib/posthog", () => ({
  isPostHogConfigured: () => true,
  posthog: { capture: (...args: unknown[]) => capture(...args) },
}));
vi.mock("@/lib/confetti", () => ({ fireTaskConfetti: () => {} }));
vi.mock("@/services/checklist", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/checklist")>();
  return { ...actual, getTasks: vi.fn(async () => checklistFixture) };
});

async function rest(path: string, init: { method: string; body?: unknown; prefer?: string }) {
  const res = await realFetch(`${API_URL}${path}`, {
    method: init.method,
    headers: {
      "content-type": "application/json",
      apikey: ANON_KEY,
      authorization: `Bearer ${jwts.get(account.id ?? "")}`,
      ...(init.prefer ? { prefer: init.prefer } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`rest ${path} ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}
const generateReply = vi.fn();
vi.mock("@/services/companion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/companion")>();
  return {
    ...actual,
    // The account's real conversations: an open conversation is shown from this list.
    getConversations: vi.fn(async () => {
      const rows = await rest("/rest/v1/conversations?select=conversation_identifier,title,updated_at", {
        method: "GET",
      });
      return rows.map((c: Record<string, string>) => ({
        id: c.conversation_identifier,
        title: c.title,
        updatedAt: c.updated_at ?? new Date().toISOString(),
      }));
    }),
    getMessages: vi.fn(async (id: string) => {
      const rows = await rest(
        `/rest/v1/messages?select=id,role,content,created_at,conversations!inner(conversation_identifier)&conversations.conversation_identifier=eq.${id}&order=id`,
        { method: "GET" },
      );
      return rows.map((m: Record<string, unknown>) => ({
        id: m.id,
        conversationId: id,
        role: m.role,
        content: m.content,
        sources: null,
        createdAt: m.created_at,
      }));
    }),
    createConversation: vi.fn(async () => {
      const [row] = await rest("/rest/v1/conversations?select=conversation_identifier", {
        method: "POST",
        body: { user_id: account.id, title: "First week" },
        prefer: "return=representation",
      });
      return { id: row.conversation_identifier, title: "First week", updatedAt: new Date().toISOString() };
    }),
    saveMessage: vi.fn(async (input: { conversationIdentifier: string; role: string; content: string }) => {
      const [conv] = await rest(
        `/rest/v1/conversations?select=id&conversation_identifier=eq.${input.conversationIdentifier}`,
        { method: "GET" },
      );
      const [row] = await rest("/rest/v1/messages?select=id,created_at", {
        method: "POST",
        body: { conversation_id: conv.id, role: input.role, content: input.content },
        prefer: "return=representation",
      });
      return {
        id: row.id,
        conversationId: input.conversationIdentifier,
        role: input.role,
        content: input.content,
        sources: null,
        createdAt: row.created_at,
      };
    }),
    generateReply: (...args: unknown[]) => generateReply(...args),
    getChatbotUsage: vi.fn(async () => ({ messageCount: 0, isPremium: false })),
  };
});
vi.mock("@/hooks/useProfile", () => ({
  useCurrentUser: () => ({ data: account.id ? { id: account.id, onboarding: null } : null }),
}));
vi.mock("@/components/companion/ConversationList", () => ({ ConversationList: () => null }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/companion",
  useSearchParams: () => new URLSearchParams(),
}));

import CompanionPage from "@/app/(main)/companion/page";
import { clearTaskActionStores } from "@/lib/companionActions/taskActionStore";
import { clearPlanStores } from "@/lib/companionActions/planStore";
import { clearComposerDrafts } from "@/lib/companion/composerDrafts";

// ---------------------------------------------------------------- the real stack
type Hook = (body: Record<string, unknown>, forward: () => Promise<Response>) => Promise<Response>;
let hook: Hook | null = null;
/** The same-origin proxy: forwards the body to the real function with the session's JWT. */
function installProxy() {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.endsWith("/api/companion/actions")) return realFetch(input, init);
    const body = JSON.parse(String(init?.body ?? "{}"));
    const forward = () =>
      realFetch(`${API_URL}/functions/v1/companion-actions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          apikey: ANON_KEY,
          authorization: `Bearer ${jwts.get(account.id ?? "")}`,
        },
        body: JSON.stringify(body),
      });
    return hook ? hook(body, forward) : forward();
  }) as typeof fetch;
}

async function http(path: string, init: RequestInit & { key?: string; jwt?: string }) {
  const res = await realFetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      apikey: init.key ?? ANON_KEY,
      authorization: `Bearer ${init.jwt ?? init.key ?? ANON_KEY}`,
    },
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

async function newAccount(label: string) {
  const email = `${label}-${Date.now()}@web364.invalid`;
  const password = "web-plans-1";
  const created = await http("/auth/v1/admin/users", {
    method: "POST",
    key: SERVICE_KEY,
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const token = await http("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  const id = created.json.id as string;
  const jwt = token.json.access_token as string;
  jwts.set(id, jwt);
  await http("/rest/v1/user_onboarding_profiles", {
    method: "POST",
    jwt,
    body: JSON.stringify({
      id, persona: "skilled_worker", city: "Vancouver", province: "British Columbia",
      arrival_date: "2026-11-02T00:00:00Z", stage: 0, wants_reminders: false,
    }),
  });
  for (const sanity of ["sin-number", "bank-account"]) {
    await http("/rest/v1/user_tasks", {
      method: "POST",
      jwt,
      body: JSON.stringify({ user_id: id, sanity_checklist_id: sanity, completed: false }),
    });
  }
  return { id, jwt };
}

const actions = (jwt: string, body: Record<string, unknown>) =>
  http("/functions/v1/companion-actions", {
    method: "POST",
    jwt,
    body: JSON.stringify({ contract_version: 1, client: { platform: "ios", app_version: "test" }, ...body }),
  });
const customTasks = async (jwt: string) =>
  (await http("/rest/v1/custom_checklist_tasks?select=title", { method: "GET", jwt })).json as { title: string }[];

const GOAL = "Your first week in Vancouver";
const PHONE = "Set up phone service";
const SUGGESTION = {
  type: "plan",
  version: 1,
  goal: GOAL,
  items: [
    { kind: "existing", task_ref: "sanity:sin-number", label: "Get your SIN" },
    { kind: "existing", task_ref: "sanity:bank-account", label: "Open a bank account" },
    { kind: "new", title: PHONE },
  ],
};
const reply = () => ({
  answer: "You already have your SIN and bank tasks. A phone plan helps with both.",
  sources: null,
  suggestedNextSteps: null,
  disclaimerKind: null,
  context: null,
  contextRecord: null,
  queryType: "newcomer_settlement",
  topic: null,
  tokenUsage: null,
  estimatedCostUsd: null,
  actionProposal: null,
  planProposal: { goal: GOAL, items: SUGGESTION.items },
});

async function savedPlanFor(acc: { jwt: string }) {
  const p = await actions(acc.jwt, { action: "plan_prepare", goal: GOAL, items: SUGGESTION.items });
  const d = p.json.plan_proposal;
  const w = await actions(acc.jwt, {
    action: "plan_apply",
    operation_id: crypto.randomUUID(),
    authorization: { kind: "approved_proposal", proposal_id: d.plan_proposal_id, proposal_revision: d.proposal_revision },
    items: d.items,
  });
  if (w.status !== 200) throw new Error(`plan_apply ${w.status}`);
  return w.json;
}

/** The app's i18n options that matter here: v3 plural keys (`key_plural`), as lib/i18n. */
function appI18n() {
  const i18n = createInstance();
  void i18n.use(initReactI18next).init({
    lng: "en",
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
    compatibilityJSON: "v3",
    initImmediate: false,
  });
  return i18n;
}

function mount() {
  const queryClient = newQueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={appI18n()}>
        <CompanionPage />
      </I18nextProvider>
    </QueryClientProvider>,
  );
  return queryClient;
}
async function send(text: string) {
  const box = screen.getByRole("textbox", { name: /message/i });
  fireEvent.change(box, { target: { value: text } });
  fireEvent.keyDown(box, { key: "Enter" });
}
async function enabledButton(scope: ReturnType<typeof within>, name: string | RegExp) {
  const button = await scope.findByRole("button", { name }, { timeout: 10_000 });
  await waitFor(() => expect(scope.getByRole("button", { name }).getAttribute("aria-disabled")).not.toBe("true"), {
    timeout: 10_000,
  });
  return button;
}

beforeEach(() => {
  Element.prototype.scrollIntoView = () => {};
  clearTaskActionStores(null);
  clearPlanStores(null);
  clearComposerDrafts(null);
  generateReply.mockReset();
  capture.mockReset();
  hook = null;
  checklistFixture = [];
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
  installProxy();
});
afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
});

const describeStack = enabled ? describe : describe.skip;
describeStack("Settlement plans against the real local stack (web)", () => {
  it("a saved task completion reconciles the plan entry without reopening the page", { timeout: 60_000 }, async () => {
    const acc = await newAccount("plan-progress");
    account.set(acc.id);
    const saved = await savedPlanFor(acc);
    checklistFixture = tasksFromPlan(saved.plan.items);
    mount();
    const entry = await screen.findByRole("button", { name: new RegExp(`Your plan, ${GOAL}, 0 of 3 done`) }, { timeout: 10_000 });
    fireEvent.change(screen.getByRole("textbox", { name: /message/i }), { target: { value: "Keep this question" } });
    fireEvent.click(entry);
    fireEvent.click(await within(screen.getByRole("dialog")).findByRole("button", { name: `${PHONE}, Not started` }));
    await waitFor(() => expect(within(screen.getByRole("dialog")).getByRole("radio", { name: "Completed" }).getAttribute("aria-disabled")).not.toBe("true"));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("radio", { name: "Completed" }));
    await within(screen.getByRole("dialog")).findByText("Changed from Not started to Completed", {}, { timeout: 10_000 });
    const current = await actions(acc.jwt, { action: "read" });
    const phoneRef = saved.receipt.results[2].task_ref;
    expect(current.json.tasks.find((row: { task_ref: string }) => row.task_ref === phoneRef).state).toBe("completed");
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await screen.findByRole("button", { name: new RegExp(`Your plan, ${GOAL}, 1 of 3 done`) }, { timeout: 10_000 });
    expect((screen.getByRole("textbox", { name: /message/i }) as HTMLTextAreaElement).value).toBe("Keep this question");
  });
  it("a saved plan task opens its controls directly in the same drawer", { timeout: 60_000 }, async () => {
    const acc = await newAccount("plan-navigation");
    account.set(acc.id);
    const saved = await savedPlanFor(acc);
    checklistFixture = tasksFromPlan(saved.plan.items);
    mount();
    fireEvent.click(await screen.findByRole("button", { name: new RegExp(`Your plan, ${GOAL}`) }, { timeout: 10_000 }));
    fireEvent.click(await within(screen.getByRole("dialog")).findByRole("button", { name: `${PHONE}, Not started` }));
    await waitFor(() => expect(within(screen.getByRole("dialog")).getByRole("radiogroup")).toBeTruthy(), { timeout: 10_000 });
    expect(within(screen.getByRole("dialog")).getByRole("heading", { name: PHONE })).toBeTruthy();
  });
  it("reviews a suggested plan in the drawer: two reused tasks, one addition, an exclusion that changes the count, one approval, focus and draft kept", { timeout: 60_000 }, async () => {
    const acc = await newAccount("web-plan-a");
    account.set(acc.id);
    generateReply.mockResolvedValue(reply());
    mount();
    await send("I arrive in Vancouver next week. Help me plan my first week.");

    const card = await screen.findByTestId("plan-card", {}, { timeout: 10_000 });
    expect(within(card).getByText("Draft plan · not saved yet")).toBeTruthy();
    expect(within(card).getByText("2 tasks you already have · 1 new task")).toBeTruthy();
    expect(await customTasks(acc.jwt)).toEqual([]);
    const box = screen.getByRole("textbox", { name: /message/i }) as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "My next question" } });

    const review = within(card).getByRole("button", { name: `Review plan: ${GOAL}` });
    review.focus();
    fireEvent.click(review);
    const drawer = await screen.findByRole("dialog", { name: "Review plan" });
    expect(await within(drawer).findByText("Get your SIN")).toBeTruthy();
    expect(within(drawer).getAllByText("Already in your Checklist · Not started")).toHaveLength(2);
    const include = within(drawer).getByRole("checkbox", { name: `Add ${PHONE}` }) as HTMLInputElement;
    expect(include.checked).toBe(true);
    await enabledButton(within(drawer), "Approve and add 1 task");

    include.focus();
    fireEvent.click(include);
    await enabledButton(within(drawer), "Save plan with existing tasks");
    // The control the user used keeps focus through the revision.
    expect(document.activeElement).toBe(within(drawer).getByRole("checkbox", { name: `Add ${PHONE}` }));
    fireEvent.click(within(drawer).getByRole("checkbox", { name: `Add ${PHONE}` }));
    const approve = await enabledButton(within(drawer), "Approve and add 1 task");
    approve.focus();
    fireEvent.click(approve);
    fireEvent.click(approve);
    expect(await within(drawer).findByText("Added 1 task. Reused 2 tasks you already had.", {}, { timeout: 10_000 })).toBeTruthy();
    expect((await customTasks(acc.jwt)).map((t) => t.title)).toEqual([PHONE]);
    // Focus stays inside the drawer after the update; Escape returns it to Review.
    await waitFor(() => expect(drawer.contains(document.activeElement)).toBe(true));
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect((screen.getByRole("textbox", { name: /message/i }) as HTMLTextAreaElement).value).toBe("My next question");
    expect(document.activeElement?.textContent).toMatch(/Review plan|Open plan/);
    // The persistent entry outside messages names the saved plan.
    expect(await screen.findByRole("button", { name: new RegExp(`Your plan, ${GOAL}, 0 of 3 done`) }, { timeout: 10_000 })).toBeTruthy();
    expect(JSON.stringify(capture.mock.calls)).not.toContain(PHONE);
  });

  it("resumes the saved plan after a reload with current progress, says it is checking while the read is pending, and Undo asks before removing the added task", { timeout: 60_000 }, async () => {
    const acc = await newAccount("web-plan-b");
    account.set(acc.id);
    await savedPlanFor(acc);
    const st = await actions(acc.jwt, {
      action: "apply", operation_id: crypto.randomUUID(), authorization: { kind: "ui_control" },
      operations: [{ type: "task.set_state", task_ref: "sanity:sin-number", state: "completed", expected_revision: 1 }],
    });
    expect(st.status).toBe(200);
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    let heldOnce = false;
    hook = async (body, forward) => {
      if (!heldOnce && body.action === "plans") {
        heldOnce = true;
        await held;
      }
      return forward();
    };
    mount();
    expect(await screen.findByText("Checking your saved plan…")).toBeTruthy();
    act(() => release());
    const entry = await screen.findByRole("button", { name: new RegExp(`Your plan, ${GOAL}, 1 of 3 done`) }, { timeout: 10_000 });
    fireEvent.click(entry);
    const drawer = await screen.findByRole("dialog", { name: "Your plan" });
    expect(await within(drawer).findByRole("button", { name: "Get your SIN, Completed" })).toBeTruthy();
    expect(within(drawer).getByRole("button", { name: `${PHONE}, Not started` })).toBeTruthy();
    fireEvent.click(await enabledButton(within(drawer), "Undo plan change"));
    expect(within(drawer).getByText(`This removes 1 task the plan added: ${PHONE}. Your other tasks stay as they are.`)).toBeTruthy();
    fireEvent.click(within(drawer).getByRole("button", { name: "Keep plan" }));
    expect((await customTasks(acc.jwt)).length).toBe(1);
    fireEvent.click(await enabledButton(within(drawer), "Undo plan change"));
    fireEvent.click(await enabledButton(within(drawer), "Undo plan"));
    expect(await within(drawer).findByText("Plan undone. Removed 1 task.", {}, { timeout: 10_000 })).toBeTruthy();
    expect(await customTasks(acc.jwt)).toEqual([]);
  });

  it("a reply lost after commit is looked up before anything else; a failed lookup stays unresolved and never writes again", { timeout: 60_000 }, async () => {
    const acc = await newAccount("web-plan-c");
    account.set(acc.id);
    await actions(acc.jwt, { action: "plan_prepare", goal: GOAL, items: SUGGESTION.items });
    let applies = 0;
    let lookups = 0;
    hook = async (body, forward) => {
      if (body.action === "plan_apply") {
        applies++;
        await forward();
        throw new TypeError("Failed to fetch");
      }
      if (body.action === "plan_status" && ++lookups === 1) throw new TypeError("Failed to fetch");
      return forward();
    };
    mount();
    fireEvent.click(await screen.findByRole("button", { name: new RegExp(`Draft plan, ${GOAL}`) }, { timeout: 10_000 }));
    const drawer = await screen.findByRole("dialog", { name: "Review plan" });
    fireEvent.click(await enabledButton(within(drawer), "Approve and add 1 task"));
    expect(await within(drawer).findByText("We could not check the result. The change may or may not have saved.", {}, { timeout: 10_000 })).toBeTruthy();
    expect(within(drawer).getByRole("button", { name: "Approve and add 1 task" }).getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(within(drawer).getByRole("button", { name: "Check again" }));
    expect(await within(drawer).findByText("Added 1 task. Reused 2 tasks you already had.", {}, { timeout: 10_000 })).toBeTruthy();
    expect(applies).toBe(1);
    expect((await customTasks(acc.jwt)).length).toBe(1);
  });

  it("a retry after a relevant profile change asks for a new approval of the remaining addition, still reachable after a reload; approving adds exactly one task", { timeout: 90_000 }, async () => {
    // Wrong if: the needs-review result is not shown, the same Retry is offered again,
    // the review is missing the remaining addition or its before/current context, it is
    // gone after a reload, a second change is approved under the first review, approval
    // adds zero or two tasks, or the reused tasks change.
    if (!DB_CONTAINER) throw new Error("ACTIONS_DB_CONTAINER must name the local stack's database container.");
    const psql = (sqlText: string) =>
      execFileSync("docker", ["exec", "-i", DB_CONTAINER, "psql", "-v", "ON_ERROR_STOP=1", "-qtA", "-U", "postgres", "-d", "postgres"],
        { input: sqlText, encoding: "utf8" }).trim();
    const acc = await newAccount("web-plan-e");
    account.set(acc.id);
    psql(`create function public.test364_web_fault() returns trigger language plpgsql as $f$
            begin if new.title = '${PHONE}' then raise exception 'injected fault'; end if; return new; end $f$;
          create trigger test364_web_fault before insert on custom_checklist_tasks
            for each row execute function public.test364_web_fault();`);
    let saved: { status: string; plan: { items: { task_ref: string; source: string; title: string | null; label: string | null }[] } };
    try {
      saved = await savedPlanFor(acc);
    } finally {
      psql("drop trigger test364_web_fault on custom_checklist_tasks; drop function public.test364_web_fault();");
    }
    expect(saved.status).toBe("partial");
    checklistFixture = tasksFromPlan(saved.plan.items);
    const reused = () =>
      psql(`select string_agg(sanity_checklist_id || ':' || coalesce(revision, 0) || ':' || completed, ',' order by sanity_checklist_id)
              from user_tasks where user_id = '${acc.id}';`);
    const reusedBefore = reused();
    const setCity = (city: string) =>
      http(`/rest/v1/user_onboarding_profiles?id=eq.${acc.id}`, { method: "PATCH", jwt: acc.jwt, body: JSON.stringify({ city }) });

    mount();
    fireEvent.click(await screen.findByRole("button", { name: new RegExp(`Your plan, ${GOAL}`) }, { timeout: 10_000 }));
    let drawer = await screen.findByRole("dialog", { name: "Your plan" });
    expect(await within(drawer).findByText(`Could not add: ${PHONE}. Everything else is saved.`)).toBeTruthy();
    await setCity("Surrey");
    fireEvent.click(await enabledButton(within(drawer), "Try adding 1 task again"));
    expect(await within(drawer).findByText(`Not added, because something changed: ${PHONE}.`, {}, { timeout: 10_000 })).toBeTruthy();
    const review = await within(drawer).findByRole("region", { name: "Review the remaining change" }, { timeout: 10_000 });
    expect(within(review).getByText("City: Surrey")).toBeTruthy();
    expect(within(review).getByText("Before: Vancouver")).toBeTruthy();
    expect((within(review).getByRole("checkbox", { name: `Add ${PHONE}` }) as HTMLInputElement).checked).toBe(true);
    await enabledButton(within(review), "Approve and add 1 task");
    expect(within(drawer).queryByRole("button", { name: "Try adding 1 task again" })).toBeNull();
    expect(await customTasks(acc.jwt)).toEqual([]);

    // A reload: new query client, no store state. The entry says a review is waiting.
    cleanup();
    clearPlanStores(null);
    mount();
    fireEvent.click(await screen.findByRole("button", { name: new RegExp(`Your plan, ${GOAL}, .*needs your review`) }, { timeout: 10_000 }));
    drawer = await screen.findByRole("dialog", { name: "Your plan" });
    expect(await within(drawer).findByText("City: Surrey", {}, { timeout: 10_000 })).toBeTruthy();
    // It changes again before approval: nothing is written and the refreshed review shows it.
    await setCity("Burnaby");
    fireEvent.click(await enabledButton(within(drawer), "Approve and add 1 task"));
    expect(await within(drawer).findByText("City: Burnaby", {}, { timeout: 10_000 })).toBeTruthy();
    expect(within(drawer).getByText("Before: Surrey")).toBeTruthy();
    expect(await customTasks(acc.jwt)).toEqual([]);
    const approve = await enabledButton(within(drawer), "Approve and add 1 task");
    fireEvent.click(approve);
    fireEvent.click(approve);
    expect(await within(drawer).findByText(`Added after your review: ${PHONE}.`, {}, { timeout: 10_000 })).toBeTruthy();
    expect((await customTasks(acc.jwt)).map((t) => t.title)).toEqual([PHONE]);
    expect(reused()).toBe(reusedBefore);
    expect(within(drawer).queryByRole("button", { name: /Approve and add/ })).toBeNull();
    expect(await within(drawer).findByRole("button", { name: `${PHONE}, Not started` }, { timeout: 10_000 })).toBeTruthy();
    await waitFor(() => expect(drawer.contains(document.activeElement)).toBe(true));
    expect(JSON.stringify(capture.mock.calls)).not.toContain(PHONE);
  });

  it("two unfinished retry reviews both stay reachable after a reload; closing one keeps the other and focus in the drawer", { timeout: 120_000 }, async () => {
    // Wrong if: after a reload either review is missing, Retry is offered for an addition
    // waiting in a review, Not now on one review closes or changes the other or drops
    // focus out of the drawer, the closed addition does not return to Retry, keeping the
    // user's own task adds a task, or the typed message is lost.
    if (!DB_CONTAINER) throw new Error("ACTIONS_DB_CONTAINER must name the local stack's database container.");
    const psql = (sqlText: string) =>
      execFileSync("docker", ["exec", "-i", DB_CONTAINER, "psql", "-v", "ON_ERROR_STOP=1", "-qtA", "-U", "postgres", "-d", "postgres"],
        { input: sqlText, encoding: "utf8" }).trim();
    const LIBRARY = "Get a library card";
    const fault = (titles: string[]) =>
      psql(`create or replace function public.test364_web_fault2() returns trigger language plpgsql as $f$
              begin if new.title in (${titles.map((x) => `'${x}'`).join(", ") || "null"}) then raise exception 'injected fault'; end if; return new; end $f$;`);
    const acc = await newAccount("web-plan-g");
    account.set(acc.id);
    fault([PHONE, LIBRARY]);
    psql(`create trigger test364_web_fault2 before insert on custom_checklist_tasks
            for each row execute function public.test364_web_fault2();`);
    try {
      const p = await actions(acc.jwt, { action: "plan_prepare", goal: GOAL, items: [...SUGGESTION.items, { kind: "new", title: LIBRARY }] });
      const draft = p.json.plan_proposal;
      const saved = await actions(acc.jwt, {
        action: "plan_apply", operation_id: crypto.randomUUID(),
        authorization: { kind: "approved_proposal", proposal_id: draft.plan_proposal_id, proposal_revision: draft.proposal_revision },
        items: draft.items,
      });
      expect(saved.json.receipt.results.map((r: { outcome: string }) => r.outcome)).toEqual(["reused", "reused", "failed", "failed"]);
      checklistFixture = tasksFromPlan(saved.json.plan.items);
      fault([LIBRARY]);
      const mine = await http("/rest/v1/custom_checklist_tasks", {
        method: "POST", jwt: acc.jwt, body: JSON.stringify({ user_id: acc.id, title: PHONE, description: "", priority: "Do soon" }),
      });
      expect(mine.status).toBeLessThan(300);

      mount();
      fireEvent.change(screen.getByRole("textbox", { name: /message/i }), { target: { value: "Keep this question" } });
      fireEvent.click(await screen.findByRole("button", { name: new RegExp(`Your plan, ${GOAL}`) }, { timeout: 10_000 }));
      let drawer = await screen.findByRole("dialog", { name: "Your plan" });
      fireEvent.click(await enabledButton(within(drawer), "Try adding 2 tasks again"));
      await within(drawer).findByRole("checkbox", { name: `Add ${PHONE}` }, { timeout: 10_000 });
      // The library card failed again; a relevant change opens a separate review for it.
      await http(`/rest/v1/user_onboarding_profiles?id=eq.${acc.id}`, { method: "PATCH", jwt: acc.jwt, body: JSON.stringify({ city: "Surrey" }) });
      fireEvent.click(await enabledButton(within(drawer), "Try adding 1 task again"));
      await within(drawer).findByRole("checkbox", { name: `Add ${LIBRARY}` }, { timeout: 10_000 });
      fault([]);

      // A reload: new query client, no store state. Both reviews are reached from the entry.
      cleanup();
      clearPlanStores(null);
      mount();
      fireEvent.click(await screen.findByRole("button", { name: new RegExp(`Your plan, ${GOAL}, .*needs your review`) }, { timeout: 10_000 }));
      drawer = await screen.findByRole("dialog", { name: "Your plan" });
      await within(drawer).findByRole("checkbox", { name: `Add ${LIBRARY}` }, { timeout: 10_000 });
      expect(within(drawer).queryByRole("checkbox", { name: `Add ${PHONE}` }), "the first unfinished review has no route after a reload").not.toBeNull();
      expect(within(drawer).queryByRole("button", { name: /Try adding/ })).toBeNull();
      const phoneReview = within(drawer).getByRole("region", { name: `Review the remaining change: ${PHONE}` });
      const libraryReview = within(drawer).getByRole("region", { name: `Review the remaining change: ${LIBRARY}` });

      // Not now on the library-card review, from the keyboard: the phone review stays as it
      // was, focus stays in the drawer, and the library card goes back to Retry.
      const notNow = await enabledButton(within(libraryReview), "Not now");
      notNow.focus();
      fireEvent.click(notNow, { detail: 0 });
      await within(drawer).findByRole("button", { name: "Try adding 1 task again" }, { timeout: 10_000 });
      await waitFor(() => expect(within(drawer).queryByRole("checkbox", { name: `Add ${LIBRARY}` })).toBeNull());
      await waitFor(() => expect(drawer.contains(document.activeElement)).toBe(true));
      expect((within(phoneReview).getByRole("checkbox", { name: `Add ${PHONE}` }) as HTMLInputElement).checked).toBe(true);
      expect(within(phoneReview).getByText(`You may already have this task: ${PHONE}`)).toBeTruthy();

      // The phone review: the user keeps their own task instead of adding another.
      fireEvent.click(await enabledButton(within(drawer), "Use the task I have"));
      fireEvent.click(await enabledButton(within(drawer), "Save without adding it"));
      expect(await within(drawer).findByText(`Using the task you already have: ${PHONE}.`, {}, { timeout: 10_000 })).toBeTruthy();
      expect((await customTasks(acc.jwt)).map((t) => t.title)).toEqual([PHONE]);
      expect(within(drawer).queryByRole("button", { name: /Approve and add|Save without adding/ })).toBeNull();
      expect((screen.getByRole("textbox", { name: /message/i }) as HTMLTextAreaElement).value).toBe("Keep this question");
    } finally {
      psql("drop trigger if exists test364_web_fault2 on custom_checklist_tasks; drop function if exists public.test364_web_fault2();");
    }
  });

  it("an account change closes the previous account's plan and shows none of it", { timeout: 60_000 }, async () => {
    const a = await newAccount("web-plan-d1");
    const b = await newAccount("web-plan-d2");
    account.set(a.id);
    await savedPlanFor(a);
    mount();
    fireEvent.click(await screen.findByRole("button", { name: new RegExp(`Your plan, ${GOAL}`) }, { timeout: 10_000 }));
    await screen.findByRole("dialog", { name: "Your plan" });
    act(() => account.set(b.id));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByText(GOAL)).toBeNull();
    await waitFor(() => expect(screen.queryByText("Checking your saved plan…")).toBeNull(), { timeout: 10_000 });
    expect(screen.queryByRole("button", { name: /Your plan/ })).toBeNull();
  });
});

// Composition of #364 and #366 (integration reconciliation): the same real stack and
// actual page, plan entry, drawer and step controls. Added with the integration.
describeStack("Plan and task steps together against the real local stack (web)", () => {
  it("a task the approved plan added takes a step; the step never completes the task or the plan; explicit completion updates the plan and keeps the step", { timeout: 90_000 }, async () => {
    // Wrong if: the plan-added task has no step controls, checking its only step changes
    // the task state or the plan count, or completion loses the step or the plan count.
    const acc = await newAccount("web-plan-steps");
    account.set(acc.id);
    generateReply.mockResolvedValue(reply());
    // The Checklist read lists what the approval saved, as the real read would.
    hook = async (body, forward) => {
      const res = await forward();
      if (body.action === "plan_apply" && res.ok) checklistFixture = tasksFromPlan((await res.clone().json()).plan.items);
      return res;
    };
    mount();
    await send("I arrive in Vancouver next week. Help me plan my first week.");
    const card = await screen.findByTestId("plan-card", {}, { timeout: 10_000 });
    fireEvent.click(within(card).getByRole("button", { name: `Review plan: ${GOAL}` }));
    const review = await screen.findByRole("dialog", { name: "Review plan" });
    fireEvent.click(await enabledButton(within(review), "Approve and add 1 task"));
    await within(review).findByText("Added 1 task. Reused 2 tasks you already had.", {}, { timeout: 10_000 });
    const plans = async () => (await actions(acc.jwt, { action: "plans" })).json.plans;
    const phoneRef = (await plans())[0].items[2].task_ref as string;
    expect(phoneRef).toMatch(/^custom:/);
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    // Open the same task from the plan and add and check one step.
    fireEvent.click(await screen.findByRole("button", { name: new RegExp(`Your plan, ${GOAL}, 0 of 3 done`) }, { timeout: 10_000 }));
    fireEvent.click(await within(screen.getByRole("dialog")).findByRole("button", { name: `${PHONE}, Not started` }));
    const panel = screen.getByRole("dialog");
    const input = await within(panel).findByRole("textbox", { name: "New step" }, { timeout: 10_000 });
    fireEvent.change(input, { target: { value: "Compare phone plans" } });
    const add = within(panel).getByRole("button", { name: "Add step" });
    await waitFor(() => expect(add.getAttribute("aria-disabled")).not.toBe("true"), { timeout: 10_000 });
    fireEvent.click(add);
    const box = await within(panel).findByRole("checkbox", { name: "Compare phone plans" }, { timeout: 10_000 });
    await waitFor(() => expect((box as HTMLInputElement).disabled).toBe(false), { timeout: 10_000 });
    fireEvent.click(box);
    await within(panel).findByText("Checked step: Compare phone plans", {}, { timeout: 10_000 });
    expect(await within(panel).findByText("All steps are done. This task stays Not started until you mark it complete.")).toBeTruthy();
    expect(within(panel).getByRole("radio", { name: "Not started" }).getAttribute("aria-checked")).toBe("true");
    let read = (await actions(acc.jwt, { action: "read" })).json;
    expect(read.tasks.find((t: { task_ref: string }) => t.task_ref === phoneRef).state).toBe("not_started");
    expect(read.steps.filter((s: { task_ref: string }) => s.task_ref === phoneRef).map((s: { title: string; done: boolean }) => [s.title, s.done]))
      .toEqual([["Compare phone plans", true]]);
    expect((await plans())[0].items.map((i: { state: string }) => i.state)).toEqual(["not_started", "not_started", "not_started"]);

    // Only the explicit completion completes the task; the plan and step history follow.
    const complete = await within(panel).findByRole("button", { name: "Mark task complete" });
    await waitFor(() => expect(complete.getAttribute("aria-disabled")).not.toBe("true"), { timeout: 10_000 });
    fireEvent.click(complete);
    expect(await within(panel).findByText("Completed with 1 of 1 steps done.", {}, { timeout: 10_000 })).toBeTruthy();
    read = (await actions(acc.jwt, { action: "read" })).json;
    expect(read.tasks.find((t: { task_ref: string }) => t.task_ref === phoneRef).state).toBe("completed");
    expect(read.steps.filter((s: { task_ref: string }) => s.task_ref === phoneRef).map((s: { title: string; done: boolean }) => [s.title, s.done]))
      .toEqual([["Compare phone plans", true]]);
    expect((await plans())[0].items.map((i: { state: string }) => i.state)).toEqual(["not_started", "not_started", "completed"]);
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByRole("button", { name: new RegExp(`Your plan, ${GOAL}, 1 of 3 done`) }, { timeout: 10_000 })).toBeTruthy();
  });
});

function tasksFromPlan(items: { task_ref: string; source: string; title: string | null; label: string | null }[]): ChecklistTask[] {
  return items.map(item => ({
    id: item.task_ref.slice(item.task_ref.indexOf(":") + 1),
    isCustom: item.source === "custom",
    title: item.title ?? item.label ?? "Task",
    priority: "Do soon", description: "", completed: false,
    completedAt: null, dismissedAt: null,
  }));
}

if (!enabled) {
  it("local stack checks are skipped: ACTIONS_API_URL, ACTIONS_ANON_KEY and ACTIONS_SERVICE_ROLE_KEY are not set", () => {
    expect(enabled).toBe(false);
  });
}
