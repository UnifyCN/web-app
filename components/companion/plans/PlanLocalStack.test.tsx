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
import { execFileSync, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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
    getChatbotUsage: vi.fn(async () => {
      if (API_URL !== 'http://127.0.0.1:65080') return { messageCount: 0, isPremium: false };
      const d = await rest('/rest/v1/rpc/get_chatbot_allowance', { method: 'POST', body: {} });
      return { messageCount: d.message_count, remaining: d.remaining, dailyLimit: d.daily_limit,
        isPremium: d.is_premium, resetsAt: d.resets_at, observedAt: d.observed_at };
    }),
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
    expect(await within(drawer).findByText(`Could not add: ${PHONE}.`)).toBeTruthy();
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

// #372 uses the same public requests and mounted Companion page. It does not
// repeat the service's domain/race suites or claim real-browser/native evidence.
const describeRecovery = enabled && API_URL === "http://127.0.0.1:65060" ? describe : describe.skip;
describeRecovery("372 rendered Web recovery", () => {
  const psql = (sql: string) => execFileSync("docker", ["exec", "-i", DB_CONTAINER,
    "psql", "-v", "ON_ERROR_STOP=1", "-qtA", "-U", "postgres", "-d", "postgres"], { input: sql, encoding: "utf8" }).trim();
  beforeAll(() => {
    const project = "unify-recovery-372-r2";
    expect(DB_CONTAINER).toBe(`supabase_db_${project}`);
    expect(process.env.ACTIONS_REST_CONTAINER).toBe(`supabase_rest_${project}`);
    const containers = JSON.parse(execFileSync("docker", ["inspect", DB_CONTAINER, process.env.ACTIONS_REST_CONTAINER!], { encoding: "utf8" }));
    for (const container of containers) {
      expect(container.Config.Labels["com.supabase.cli.project"]).toBe(project);
      expect(container.State.Running).toBe(true);
    }
  });
  const openPlan = async () => {
    fireEvent.click(await screen.findByRole("button", { name: new RegExp(`Your plan, ${GOAL}`) }, { timeout: 10_000 }));
    return screen.findByRole("dialog");
  };
  const openPhone = async () => {
    const drawer = await openPlan();
    fireEvent.click(await within(drawer).findByRole("button", { name: new RegExp(`^${PHONE},`) }));
    await within(drawer).findByRole("heading", { name: PHONE });
    await waitFor(() => expect(within(drawer).getByRole("radio", { name: "Waiting" }).getAttribute("aria-disabled")).not.toBe("true"));
    return drawer;
  };
  const composer = () => screen.getByRole("textbox", { name: /message/i }) as HTMLTextAreaElement;
  const close = async () => {
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  };

  it("names saved, failed and excluded additions, retries only the failed item, and names a later Undo conflict", { timeout: 60_000 }, async () => {
    // Wrong if an excluded addition is labelled failed/saved, a retry repeats
    // successful work, or historical Undo replaces another device's newer edit.
    const acc = await newAccount("web-partial372");
    account.set(acc.id);
    const independent = "Book a bank appointment", excluded = "Join a library";
    const prepared = await actions(acc.jwt, { action: "plan_prepare", goal: GOAL,
      items: [...SUGGESTION.items, { kind: "new", title: independent }, { kind: "new", title: excluded }] });
    expect(prepared.status).toBe(200);
    const original = prepared.json.plan_proposal;
    const revised = await actions(acc.jwt, { action: "plan_revise", plan_proposal_id: original.plan_proposal_id,
      proposal_revision: original.proposal_revision,
      items: original.items.map((item: { kind: string; task_ref?: string; key?: string; title?: string }) =>
        item.kind === "existing" ? { kind: item.kind, task_ref: item.task_ref }
          : { kind: item.kind, key: item.key, include: item.title !== excluded }) });
    expect(revised.status).toBe(200);
    const proposal = revised.json.plan_proposal;
    psql(`create function public.test372_web_fault() returns trigger language plpgsql as $f$
      begin if new.user_id = '${acc.id}' and new.title = '${PHONE}' then raise exception '372 controlled failure'; end if; return new; end $f$;
      create trigger test372_web_fault before insert on custom_checklist_tasks for each row execute function public.test372_web_fault();`);
    let partial;
    try {
      partial = await actions(acc.jwt, { action: "plan_apply", operation_id: crypto.randomUUID(),
        authorization: { kind: "approved_proposal", proposal_id: proposal.plan_proposal_id, proposal_revision: proposal.proposal_revision }, items: proposal.items });
    } finally { psql("drop trigger test372_web_fault on custom_checklist_tasks; drop function public.test372_web_fault();"); }
    expect(partial.status).toBe(200);
    expect(partial.json.receipt.results.map((r: { outcome: string }) => r.outcome)).toEqual(["reused", "reused", "failed", "created"]);
    const failed = partial.json.receipt.results[2], succeeded = partial.json.receipt.results[3];
    const before = psql(`select row_to_json(c) from custom_checklist_tasks c where user_id='${acc.id}' and id=${succeeded.task_ref.slice(7)};`);
    checklistFixture = tasksFromPlan(partial.json.plan.items);
    const retries: string[] = [];
    hook = (body, forward) => { if (body.action === "plan_retry") retries.push(String(body.operation_id)); return forward(); };
    mount();
    const drawer = await openPlan();
    await within(drawer).findByText(`Could not add: ${PHONE}.`);
    expect(await within(drawer).findByText(`Left out after your review: ${excluded}.`)).toBeTruthy();
    expect(within(drawer).getByRole("button", { name: `${independent}, Not started` })).toBeTruthy();
    expect(within(drawer).queryByRole("button", { name: `${excluded}, Not started` })).toBeNull();
    fireEvent.change(composer(), { target: { value: "Keep partial recovery question" } });
    const retry = await enabledButton(within(drawer), "Try adding 1 task again");
    retry.focus(); fireEvent.click(retry); fireEvent.click(retry);
    await within(drawer).findByRole("button", { name: `${PHONE}, Not started` }, { timeout: 10_000 });
    expect(retries).toHaveLength(1);
    const retried = (await actions(acc.jwt, { action: "plan_status", operation_id: retries[0] })).json.receipt;
    expect(retried.results).toHaveLength(1);
    expect(retried.results[0]).toMatchObject({ key: failed.key, item_operation_id: failed.item_operation_id, outcome: "created" });
    expect(psql(`select row_to_json(c) from custom_checklist_tasks c where user_id='${acc.id}' and id=${succeeded.task_ref.slice(7)};`)).toBe(before);
    const moved = await actions(acc.jwt, { action: "apply", operation_id: crypto.randomUUID(), authorization: { kind: "ui_control" },
      operations: [{ type: "task.set_state", task_ref: succeeded.task_ref, state: "waiting", expected_revision: 1, waiting_reason: "Changed on another device" }] });
    expect(moved.status).toBe(200);
    fireEvent.click(await enabledButton(within(drawer), "Undo plan change"));
    fireEvent.click(await enabledButton(within(drawer), "Undo plan"));
    expect(await within(drawer).findByText(`Some tasks changed after the plan was saved. Undo will keep them: ${independent}.`)).toBeTruthy();
    expect((await actions(acc.jwt, { action: "read" })).json.tasks.find((t: { task_ref: string }) => t.task_ref === succeeded.task_ref).state).toBe("waiting");
    expect(drawer.contains(document.activeElement)).toBe(true);
    await close();
    expect(composer().value).toBe("Keep partial recovery question");
    expect((await customTasks(acc.jwt)).map(t => t.title).sort()).toEqual([independent, PHONE].sort());
  });

  it("keeps plan, task, step, Waiting reason and reminder identities after reopening, with stable input focus and draft", { timeout: 60_000 }, async () => {
    // Wrong if a step completes its parent, review saves a reminder, reopening
    // creates new identities, or a save replaces the focused reason field.
    const acc = await newAccount("web-core372");
    account.set(acc.id);
    const saved = await savedPlanFor(acc);
    const ref = saved.receipt.results[2].task_ref;
    checklistFixture = tasksFromPlan(saved.plan.items);
    const client = mount();
    const drawer = await openPhone();
    fireEvent.change(composer(), { target: { value: "Keep my next question" } });
    fireEvent.change(within(drawer).getByRole("textbox", { name: "New step" }), { target: { value: "Compare phone plans" } });
    fireEvent.click(await enabledButton(within(drawer), "Add step"));
    const checkbox = await within(drawer).findByRole("checkbox", { name: "Compare phone plans" });
    await waitFor(() => expect(checkbox.getAttribute("aria-disabled")).not.toBe("true"));
    fireEvent.click(checkbox);
    await within(drawer).findByText("Checked step: Compare phone plans");
    expect(within(drawer).getByRole("radio", { name: "Not started" }).getAttribute("aria-checked")).toBe("true");
    await waitFor(() => expect(within(drawer).getByRole("radio", { name: "Waiting" }).getAttribute("aria-disabled")).not.toBe("true"));
    fireEvent.click(within(drawer).getByRole("radio", { name: "Waiting" }));
    const reason = await within(drawer).findByRole("textbox", { name: "What are you waiting for?" });
    fireEvent.change(reason, { target: { value: "A phone appointment" } });
    reason.focus();
    fireEvent.click(await enabledButton(within(drawer), "Save waiting reason"));
    await waitFor(() => expect(within(drawer).getByRole("button", { name: "Save waiting reason" }).getAttribute("aria-disabled")).toBe("true"));
    expect(within(drawer).getByRole("textbox", { name: "What are you waiting for?" })).toBe(reason);
    expect(document.activeElement).toBe(reason);
    fireEvent.change(within(drawer).getByLabelText(en.reminders.instant), { target: { value: "2026-12-15T10:00-08:00" } });
    fireEvent.change(within(drawer).getByLabelText(en.reminders.zone), { target: { value: "America/Vancouver" } });
    fireEvent.click(await enabledButton(within(drawer), en.reminders.review));
    await enabledButton(within(drawer), en.reminders.save);
    expect((await actions(acc.jwt, { action: "read" })).json.reminders.items).toEqual([]);
    fireEvent.click(within(drawer).getByRole("button", { name: en.reminders.save }));
    await within(drawer).findByText(en.reminders.saved);
    const before = (await actions(acc.jwt, { action: "read" })).json;
    expect(before.tasks.find((t: { task_ref: string }) => t.task_ref === ref)).toMatchObject({ state: "waiting", waiting_reason: "A phone appointment" });
    expect(before.steps).toHaveLength(1); expect(before.steps[0]).toMatchObject({ task_ref: ref, done: true });
    expect(before.reminders.items).toHaveLength(1);
    expect(before.reminders.items[0]).toMatchObject({ task_ref: ref, time_zone: "America/Vancouver", status: "pending" });
    await close(); expect(composer().value).toBe("Keep my next question");
    cleanup(); client.clear(); clearPlanStores(null); clearTaskActionStores(null);
    mount(); const reopened = await openPhone();
    expect((await within(reopened).findByRole("textbox", { name: "What are you waiting for?" }) as HTMLTextAreaElement).value).toBe("A phone appointment");
    expect((within(reopened).getByRole("checkbox", { name: "Compare phone plans" }) as HTMLInputElement).checked).toBe(true);
    const after = (await actions(acc.jwt, { action: "read" })).json;
    expect([after.steps[0].step_id, after.reminders.items[0].reminder_id]).toEqual([before.steps[0].step_id, before.reminders.items[0].reminder_id]);
    expect((await actions(acc.jwt, { action: "plans" })).json.plans[0].plan_id).toBe(saved.plan.plan_id);
    expect((await customTasks(acc.jwt)).map(t => t.title)).toEqual([PHONE]);
  });

  it("blocks offline writes, refreshes another device, protects historical Undo and clears unresolved recovery on account replacement and sign-out", { timeout: 60_000 }, async () => {
    // Wrong if an offline press writes, reconnect misses the newer revision,
    // Undo replaces it, removal leaves active controls, or another account gets recovery state.
    const acc = await newAccount("web-offline372"), other = await newAccount("web-other372");
    account.set(acc.id);
    const saved = await savedPlanFor(acc), ref = saved.receipt.results[2].task_ref;
    checklistFixture = tasksFromPlan(saved.plan.items);
    const writes: Record<string, unknown>[] = [];
    let failPlan = false;
    hook = async (body, forward) => {
      if (["apply", "undo", "plan_apply"].includes(String(body.action))) writes.push(body);
      if (failPlan && ["plan_apply", "plan_status"].includes(String(body.action))) throw new TypeError("372 unavailable");
      return forward();
    };
    const client = mount(); const drawer = await openPhone();
    fireEvent.change(composer(), { target: { value: "Private recovery question" } });
    fireEvent.click(within(drawer).getByRole("radio", { name: "In progress" }));
    await within(drawer).findByText("Changed from Not started to In progress");
    const original = writes[0].operation_id;
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
    act(() => window.dispatchEvent(new Event("offline")));
    await within(drawer).findByText(en.taskActions.offline);
    const waiting = within(drawer).getByRole("radio", { name: "Waiting" });
    expect(waiting.getAttribute("aria-disabled")).toBe("true"); fireEvent.click(waiting); expect(writes).toHaveLength(1);
    const current = (await actions(acc.jwt, { action: "read" })).json.tasks.find((t: { task_ref: string }) => t.task_ref === ref);
    expect((await actions(acc.jwt, { action: "apply", operation_id: crypto.randomUUID(), authorization: { kind: "ui_control" },
      operations: [{ type: "task.set_state", task_ref: ref, state: "waiting", waiting_reason: "Changed on another device", expected_revision: current.revision }] })).status).toBe(200);
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
    act(() => window.dispatchEvent(new Event("online")));
    await within(drawer).findByDisplayValue("Changed on another device", {}, { timeout: 10_000 });
    fireEvent.click(await enabledButton(within(drawer), "Undo this change"));
    await within(drawer).findByText("This task changed after that action");
    expect(writes[1].receipt_operation_id).toBe(original);
    expect((await actions(acc.jwt, { action: "read" })).json.tasks.find((t: { task_ref: string }) => t.task_ref === ref))
      .toMatchObject({ state: "waiting", waiting_reason: "Changed on another device", revision: current.revision + 1 });
    const prepared = await actions(acc.jwt, { action: "prepare", operation: { type: "task.remove", task_ref: ref, expected_revision: current.revision + 1 } });
    expect(prepared.status).toBe(200);
    expect((await actions(acc.jwt, { action: "apply", operation_id: crypto.randomUUID(),
      authorization: { kind: "approved_proposal", proposal_id: prepared.json.proposal.proposal_id,
        proposal_revision: prepared.json.proposal.proposal_revision, removal_confirmed: true }, operations: prepared.json.proposal.operations })).status).toBe(200);
    act(() => window.dispatchEvent(new Event("online")));
    await client.invalidateQueries();
    await within(drawer).findByText(en.taskActions.removed);
    expect(within(drawer).getByRole("radio", { name: "Completed" }).getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(within(drawer).getByRole("radio", { name: "Completed" })); expect(writes).toHaveLength(2);
    await close();
    expect((await actions(acc.jwt, { action: "plan_prepare", goal: "Private recovery plan", items: SUGGESTION.items })).status).toBe(200);
    await client.invalidateQueries();
    failPlan = true;
    fireEvent.click(await screen.findByRole("button", { name: /Draft plan, Private recovery plan/ }));
    const recovery = await screen.findByRole("dialog");
    // Removal changed the draft context. The first approval refreshes the review.
    fireEvent.click(await enabledButton(within(recovery), "Approve and add 1 task"));
    await within(recovery).findByText(en.taskActions.lookupFailed);
    expect(localStorage.getItem("companion-plan-recovery-v1")).not.toBeNull();
    act(() => account.set(other.id));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(localStorage.getItem("companion-plan-recovery-v1")).toBeNull());
    expect(composer().value).toBe(""); expect(screen.queryByText("Private recovery plan")).toBeNull();
    expect((await actions(other.jwt, { action: "read" })).json.tasks).toHaveLength(2);
    act(() => account.set(acc.id));
    await screen.findByRole("button", { name: /Draft plan, Private recovery plan/ });
    fireEvent.change(composer(), { target: { value: "Clear on sign-out" } });
    expect((await http("/auth/v1/logout", { method: "POST", jwt: acc.jwt })).status).toBe(204);
    act(() => account.set(null));
    await waitFor(() => expect(composer().value).toBe(""));
    expect(screen.queryByRole("button", { name: new RegExp(`Your plan, ${GOAL}`) })).toBeNull();
    expect(writes.filter(w => w.action === "plan_apply")).toHaveLength(1);
  });

  it("keeps a real pending operation lookup-only and retries its unchanged identity after confirmed not-applied", { timeout: 60_000 }, async () => {
    // Wrong if a real held operation is reported absent, a pending press
    // writes, or the confirmed-not-applied retry uses another identity.
    const acc = await newAccount("web-pending372"); account.set(acc.id);
    expect((await actions(acc.jwt, { action: "plan_prepare", goal: GOAL, items: SUGGESTION.items })).status).toBe(200);
    const holder = spawn("docker", ["exec", "-i", DB_CONTAINER, "psql", "-v", "ON_ERROR_STOP=1", "-qAt", "-U", "postgres", "-d", "postgres"]);
    let output = "", errors = "";
    holder.stderr.on("data", chunk => { errors += String(chunk); });
    const closed = new Promise<number | null>((resolve, reject) => { holder.once("close", resolve); holder.once("error", reject); });
    const writes: string[] = [];
    hook = async (body, forward) => {
      if (body.action === "plan_apply") {
        writes.push(String(body.operation_id));
        if (writes.length === 1) {
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(`Owned lock setup failed: ${errors}`)), 10_000);
            holder.stdout.on("data", chunk => {
              output += String(chunk);
              if (output.includes("372_WEB_LOCK_HELD")) { clearTimeout(timer); resolve(); }
            });
            holder.stdin.write(`begin; select pg_advisory_xact_lock(public.companion_op_lock_key('${acc.id}', '${body.operation_id}'));\n\\echo 372_WEB_LOCK_HELD\n`);
          });
          throw new TypeError("372 transport unavailable while operation is locked");
        }
      }
      return forward();
    };
    try {
      mount();
      fireEvent.click(await screen.findByRole("button", { name: new RegExp(`Draft plan, ${GOAL}`) }, { timeout: 10_000 }));
      const drawer = await screen.findByRole("dialog");
      fireEvent.click(await enabledButton(within(drawer), "Approve and add 1 task"));
      await within(drawer).findByText(en.taskActions.pending);
      const approve = within(drawer).getByRole("button", { name: "Approve and add 1 task" });
      expect(approve.getAttribute("aria-disabled")).toBe("true"); fireEvent.click(approve);
      fireEvent.click(within(drawer).getByRole("button", { name: "Check again" }));
      await within(drawer).findByText(en.taskActions.pending);
      expect(writes).toHaveLength(1); expect(await customTasks(acc.jwt)).toEqual([]);
      expect(psql(`select count(*) from companion_action_receipts where user_id='${acc.id}' and operation_id='${writes[0]}';`)).toBe("0");
      holder.stdin.end("commit;\n"); expect(await closed).toBe(0);
      fireEvent.click(within(drawer).getByRole("button", { name: "Check again" }));
      await within(drawer).findByText(en.taskActions.notApplied);
      expect(writes).toHaveLength(1);
      fireEvent.click(await enabledButton(within(drawer), "Try again"));
      await within(drawer).findByText("Added 1 task. Reused 2 tasks you already had.");
      expect(writes).toEqual([writes[0], writes[0]]); expect((await customTasks(acc.jwt)).map(t => t.title)).toEqual([PHONE]);
    } finally {
      if (!holder.stdin.writableEnded) holder.stdin.end("rollback;\n");
      await closed;
    }
  });

  const itRestart = process.env.ACTIONS_RECOVERY_RESTART_STAGE ? it : it.skip;
  itRestart("recovers a failed lookup after Web process restart before any receipt exists", { timeout: 60_000 }, async () => {
    const base = process.env.ACTIONS_RECOVERY_RESTART_DIR!;
    const file = path.join(base, "web-intent.json"), storageFile = path.join(base, "web-storage.json");
    const creating = process.env.ACTIONS_RECOVERY_RESTART_STAGE === "create";
    const acc = creating ? await newAccount("web-restart372") : JSON.parse(fs.readFileSync(file, "utf8")).account;
    account.set(acc.id); jwts.set(acc.id, acc.jwt);
    if (creating) {
      localStorage.removeItem("companion-plan-recovery-v1");
      expect((await actions(acc.jwt, { action: "plan_prepare", goal: GOAL, items: SUGGESTION.items })).status).toBe(200);
    } else localStorage.setItem("companion-plan-recovery-v1", fs.readFileSync(storageFile, "utf8"));
    const writes: string[] = [], lookups: string[] = [];
    let failLookup = true;
    hook = async (body, forward) => {
      if (body.action === "plan_status") {
        lookups.push(String(body.operation_id));
        if (failLookup) throw new TypeError("372 lookup unavailable");
      }
      if (body.action === "plan_apply") {
        writes.push(String(body.operation_id));
        if (creating) throw new TypeError("372 failed before send");
      }
      return forward();
    };
    mount();
    fireEvent.click(await screen.findByRole("button", { name: new RegExp(`Draft plan, ${GOAL}`) }, { timeout: 10_000 }));
    const drawer = await screen.findByRole("dialog");
    if (creating) {
      fireEvent.click(await enabledButton(within(drawer), "Approve and add 1 task"));
      await within(drawer).findByText(en.taskActions.lookupFailed, {}, { timeout: 10_000 });
      expect(writes).toHaveLength(1);
      fs.mkdirSync(base, { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ account: acc, operationId: writes[0] }));
      fs.writeFileSync(storageFile, localStorage.getItem("companion-plan-recovery-v1")!);
    } else {
      const original = JSON.parse(fs.readFileSync(file, "utf8")).operationId;
      await within(drawer).findByText(en.taskActions.lookupFailed, {}, { timeout: 10_000 });
      const approve = within(drawer).getByRole("button", { name: "Approve and add 1 task" });
      expect(approve.getAttribute("aria-disabled")).toBe("true");
      fireEvent.click(approve);
      fireEvent.click(within(drawer).getByRole("button", { name: "Check again" }));
      await within(drawer).findByText(en.taskActions.lookupFailed);
      expect(writes).toEqual([]); expect(lookups).toEqual([original]);
      expect(await customTasks(acc.jwt)).toEqual([]);
      failLookup = false;
      fireEvent.click(within(drawer).getByRole("button", { name: "Check again" }));
      await within(drawer).findByText(en.taskActions.notApplied);
      expect(writes).toEqual([]);
      fireEvent.click(await enabledButton(within(drawer), "Try again"));
      await within(drawer).findByText("Added 1 task. Reused 2 tasks you already had.", {}, { timeout: 10_000 });
      expect(writes).toEqual([original]); expect(lookups).toEqual([original, original]);
      expect((await actions(acc.jwt, { action: "plan_status", operation_id: original })).json.receipt.operation_id).toBe(original);
    }
  });
});


const describeAllowance = enabled && API_URL === 'http://127.0.0.1:65080' ? describe : describe.skip;
describeAllowance('373 server allowance on the rendered Web client', () => {
  it('keeps the draft, focused editor and saved task controls at exhaustion', { timeout: 60_000 }, async () => {
    expect(DB_CONTAINER).toBe('supabase_db_unify-allowance-373-r1');
    const inspected = JSON.parse(execFileSync('docker', ['inspect', DB_CONTAINER], { encoding: 'utf8' }))[0];
    expect(inspected.Config.Labels['com.supabase.cli.project']).toBe('unify-allowance-373-r1');
    const acc = await newAccount('allowance373'); account.set(acc.id);
    execFileSync('docker', ['exec','-i',DB_CONTAINER,'psql','-v','ON_ERROR_STOP=1','-qtA','-U','postgres','-d','postgres'], { input: `insert into chatbot_usage(user_id,message_count,last_message_at) values('${acc.id}',6,now());`, encoding:'utf8' });
    const saved = await savedPlanFor(acc); checklistFixture = tasksFromPlan(saved.plan.items);
    mount();
    await screen.findByText(/0 AI messages remaining/);
    const box = screen.getByRole('textbox', { name: /message/i }) as HTMLTextAreaElement;
    box.focus(); fireEvent.change(box, { target: { value: 'Keep my allowance draft' } });
    const ownerFocus = document.activeElement;
    expect(ownerFocus).toBe(box);
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(`Your plan, ${GOAL}`) }));
    const drawer = await screen.findByRole('dialog');
    fireEvent.click(await within(drawer).findByRole('button', { name: `${PHONE}, Not started` }));
    const completed = await within(drawer).findByRole('radio',{name:'Completed'});
    await waitFor(() => expect(completed.getAttribute('aria-disabled')).not.toBe('true'));
    completed.focus(); fireEvent.click(completed);
    await within(drawer).findByText('Changed from Not started to Completed');
    expect(box.value).toBe('Keep my allowance draft');
    expect(drawer.contains(document.activeElement)).toBe(true);
    const read = await actions(acc.jwt,{ action:'read' });
    expect(read.json.tasks.find((t: { task_ref: string }) => t.task_ref === saved.receipt.results[2].task_ref).state).toBe('completed');
    expect(generateReply).not.toHaveBeenCalled();
    const quota = await http('/rest/v1/rpc/get_chatbot_allowance', { method:'POST',jwt:acc.jwt,body:'{}' });
    expect(quota.json.message_count).toBe(6);
  });
});
