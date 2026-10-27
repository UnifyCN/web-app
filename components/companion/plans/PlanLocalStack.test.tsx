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
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { createInstance } from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import en from "@/lib/i18n/locales/en/translation.json";
import { newQueryClient } from "../tasks/taskActionsTestHarness";

const API_URL = process.env.ACTIONS_API_URL ?? "";
const ANON_KEY = process.env.ACTIONS_ANON_KEY ?? "";
const SERVICE_KEY = process.env.ACTIONS_SERVICE_ROLE_KEY ?? "";
const enabled = /^http:\/\/127\.0\.0\.1:\d+$/.test(API_URL) && Boolean(ANON_KEY && SERVICE_KEY);
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
vi.mock("@/lib/posthog", () => ({
  isPostHogConfigured: () => true,
  posthog: { capture: (...args: unknown[]) => capture(...args) },
}));
vi.mock("@/lib/confetti", () => ({ fireTaskConfetti: () => {} }));
vi.mock("@/services/checklist", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/checklist")>();
  return { ...actual, getTasks: vi.fn(async () => []) };
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
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
  installProxy();
});
afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
});

const describeStack = enabled ? describe : describe.skip;
describeStack("Settlement plans against the real local stack (web)", () => {
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

if (!enabled) {
  it("local stack checks are skipped: ACTIONS_API_URL, ACTIONS_ANON_KEY and ACTIONS_SERVICE_ROLE_KEY are not set", () => {
    expect(enabled).toBe(false);
  });
}
