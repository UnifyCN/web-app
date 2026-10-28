// @vitest-environment jsdom
//
// Mounted acceptance of task removal on web (mobile-app#367, direction B) against the
// real local stack: the real Companion and Checklist pages, send hook, removal card,
// overlay drawer and task panel send their /api/companion/actions requests, which this
// test forwards (as the same-origin proxy does) to the real companion-actions edge
// function with the signed-in synthetic account's real JWT. The function writes through
// the real migrations to a real Postgres with RLS. Conversations and messages are saved
// to the same database. Only the AI answer and the Checklist content read are stand-ins.
//
// Runs only when ACTIONS_API_URL, ACTIONS_ANON_KEY and ACTIONS_SERVICE_ROLE_KEY point at
// the disposable 127.0.0.1 stack (supabase/tests/companion-actions/run.sh, ACTIONS_KEEP=1)
// with the #361-#367 migrations applied (timestamp order: #361, #363, #364, #366, #365,
// #367; see beforeAll), and
// ACTIONS_DB_CONTAINER names its database container.
import { useSyncExternalStore } from "react";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
const REST_CONTAINER = process.env.ACTIONS_REST_CONTAINER?.trim() ?? "";
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
import ChecklistPage from "@/app/(main)/checklist/page";
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
  const email = `${label}-${Date.now()}@web367.invalid`;
  const password = "web-remove-1";
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

function mount(page: "companion" | "checklist" = "companion") {
  const queryClient = newQueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={appI18n()}>
        {page === "companion" ? <CompanionPage /> : <ChecklistPage />}
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
describeStack("Task removal against the real local stack (web, #367)", () => {
  const psql = (sqlText: string) =>
    execFileSync("docker", ["exec", "-i", DB_CONTAINER, "psql", "-v", "ON_ERROR_STOP=1", "-qtA", "-U", "postgres", "-d", "postgres"],
      { input: sqlText, stdio: ["pipe", "pipe", "pipe"] }).toString().trim();
  const SIN: ChecklistTask = {
    id: "sin-number", priority: "Do now", title: "Get your SIN", description: "",
    completed: false, completedAt: null, dismissedAt: null, isCustom: false,
  } as ChecklistTask;
  const taskNow = async (jwt: string, ref: string) =>
    (await actions(jwt, { action: "read" })).json.tasks.find((t: { task_ref: string }) => t.task_ref === ref);
  const removals = (userId: string) =>
    Number(psql(`select count(*) from companion_action_receipts where user_id = '${userId}'
                  and outcome->'results'->0->>'type' = 'task.remove';`));
  const dialog = () => screen.getByRole("dialog");

  beforeAll(async () => {
    if (!DB_CONTAINER) throw new Error("ACTIONS_DB_CONTAINER must name the local stack's database container.");
    const has = (sig: string) => psql(`select to_regprocedure('public.${sig}') is not null;`) === "t";
    // This repo's migrations in the order the deployment applies them; a stack that has a
    // later one without an earlier one is refused, not repaired.
    const chain: [string, string][] = [
      ["companion_read_tasks(uuid)", "20261025235536_companion_task_actions.sql"],
      ["companion_prepare_proposal(uuid,jsonb,jsonb)", "20261026165156_companion_task_create.sql"],
      ["companion_plans_read(uuid)", "20261027183338_companion_settlement_plan.sql"],
      ["companion_read_steps(uuid)", "20261027183644_companion_task_steps.sql"],
      ["companion_prepare_edit(uuid,jsonb,jsonb,text)", "20261028001530_companion_task_edit.sql"],
      ["companion_remove_prepare(uuid,text,jsonb)", "20261028025026_companion_task_remove.sql"],
    ];
    const present = chain.map(([sig]) => has(sig));
    const first = present.indexOf(false);
    if (first >= 0 && present.slice(first).some(Boolean)) throw new Error("migrations applied out of order");
    for (const [, file] of chain.slice(first < 0 ? chain.length : first)) {
      psql(readFileSync(join(process.cwd(), "supabase/migrations", file), "utf8"));
    }
    psql(`update public.companion_feature_gate set enabled = true, min_contract_version = 1,
            max_contract_version = 1, allowed_platforms = '{ios,android,web}';`);
    execFileSync("docker", ["kill", "--signal=SIGUSR1", REST_CONTAINER], { stdio: "ignore" });
    for (let i = 0; i < 50; i++) {
      const ready = await http("/rest/v1/rpc/companion_read_tasks", {
        method: "POST", key: SERVICE_KEY, body: JSON.stringify({ p_user_id: "00000000-0000-0000-0000-000000000000" }),
      });
      if (ready.status === 200) break;
      await new Promise((r) => setTimeout(r, 200));
    }
  }, 120_000);

  it("a removal request opens a review in the drawer; Cancel writes nothing and returns focus; the confirmed removal names the plan; Undo restores; the draft stays", { timeout: 60_000 }, async () => {
    // Wrong if: the command removes or calls the model; the review is not focused or does
    // not name the plan; Cancel writes or loses focus; Undo does not restore; the draft is lost.
    const acc = await newAccount("web-remove-a");
    account.set(acc.id);
    await savedPlanFor(acc);
    checklistFixture = [SIN];
    mount();
    await send("Remove task: Get your SIN");
    const card = await screen.findByTestId("task-removal-card", {}, { timeout: 10_000 });
    expect(within(card).getByText("Not removed · needs your confirmation")).toBeTruthy();
    expect(generateReply).not.toHaveBeenCalled();
    expect(removals(acc.id)).toBe(0);
    const box = screen.getByRole("textbox", { name: /message/i }) as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "My next question" } });

    const review = within(card).getByRole("button", { name: "Review removal of Get your SIN" });
    review.focus();
    fireEvent.click(review);
    const heading = await within(await screen.findByRole("dialog")).findByRole("heading", { name: "Remove “Get your SIN”?" }, { timeout: 10_000 });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(within(dialog()).getByText(`Saved plans that include it: ${GOAL}. It shows there as removed.`)).toBeTruthy();
    fireEvent.click(within(dialog()).getByRole("button", { name: "Cancel" }));
    const remove = await within(dialog()).findByRole("button", { name: "Remove task: Get your SIN" });
    await waitFor(() => expect(document.activeElement).toBe(remove));
    expect(removals(acc.id)).toBe(0);
    expect((await taskNow(acc.jwt, "sanity:sin-number"))?.removed ?? false).toBe(false);

    // The panel's own control opens a fresh review; its confirmation removes.
    fireEvent.click(await enabledButton(within(dialog()), "Remove task: Get your SIN"));
    await within(dialog()).findByRole("heading", { name: "Remove “Get your SIN”?" }, { timeout: 10_000 });
    fireEvent.click(await enabledButton(within(dialog()), "Remove task"));
    expect(await within(dialog()).findByText("Removed from your Checklist: Get your SIN", {}, { timeout: 10_000 })).toBeTruthy();
    expect(within(dialog()).getByText("Saved plans: 1 · Steps kept: 0 · Reminders stopped: 0")).toBeTruthy();
    await waitFor(() => expect(dialog().contains(document.activeElement)).toBe(true));
    expect((await taskNow(acc.jwt, "sanity:sin-number")).removed).toBe(true);
    expect(removals(acc.id)).toBe(1);

    fireEvent.click(await enabledButton(within(dialog()), "Undo: Removed from your Checklist: Get your SIN"));
    expect(await within(dialog()).findByText("Restored to your Checklist: Get your SIN", {}, { timeout: 10_000 })).toBeTruthy();
    expect((await taskNow(acc.jwt, "sanity:sin-number")).removed).toBe(false);
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect((screen.getByRole("textbox", { name: /message/i }) as HTMLTextAreaElement).value).toBe("My next question");
    expect(JSON.stringify(capture.mock.calls)).not.toContain("Get your SIN");
  });

  it("the Checklist delete control opens the reviewed removal; a change on another device before approval revises the review and removes nothing", { timeout: 60_000 }, async () => {
    // Wrong if: the legacy delete modal removes without the review; an approval of the old
    // review removes the changed task; the revised review is not shown and focused.
    const acc = await newAccount("web-remove-b");
    account.set(acc.id);
    checklistFixture = [SIN];
    mount("checklist");
    fireEvent.click(await screen.findByRole("button", { name: "Remove suggestion: Get your SIN" }, { timeout: 10_000 }));
    const heading = await within(await screen.findByRole("dialog")).findByRole("heading", { name: "Remove “Get your SIN”?" }, { timeout: 10_000 });
    await waitFor(() => expect(document.activeElement).toBe(heading));

    const before = await taskNow(acc.jwt, "sanity:sin-number");
    const moved = await actions(acc.jwt, {
      action: "apply", operation_id: crypto.randomUUID(), authorization: { kind: "ui_control" },
      operations: [{ type: "task.set_state", task_ref: "sanity:sin-number", state: "in_progress", expected_revision: before.revision }],
    });
    expect(moved.status).toBe(200);
    fireEvent.click(await enabledButton(within(dialog()), "Remove task"));
    expect(await within(dialog()).findByText("This task changed after you opened this review. Check the details and confirm again.", {}, { timeout: 10_000 })).toBeTruthy();
    expect(within(dialog()).getByText("Current state: In progress")).toBeTruthy();
    await waitFor(() => expect(document.activeElement?.textContent).toBe("Remove “Get your SIN”?"));
    expect(removals(acc.id)).toBe(0);

    fireEvent.click(await enabledButton(within(dialog()), "Remove task"));
    expect(await within(dialog()).findByText("Removed from your Checklist: Get your SIN", {}, { timeout: 10_000 })).toBeTruthy();
    expect((await taskNow(acc.jwt, "sanity:sin-number")).removed).toBe(true);
    expect(removals(acc.id)).toBe(1);
  });

  it("an old removal request opened after another device removed the task offers nothing to remove; the card turns historical", { timeout: 60_000 }, async () => {
    // Wrong if: the stale review is shown or can remove again.
    const acc = await newAccount("web-remove-c");
    account.set(acc.id);
    checklistFixture = [SIN];
    mount();
    await send("Remove task: Get your SIN");
    const card = await screen.findByTestId("task-removal-card", {}, { timeout: 10_000 });
    const p = await actions(acc.jwt, { action: "prepare", operation: { type: "task.remove", task_ref: "sanity:sin-number", expected_revision: 0 } });
    const d = p.json.proposal;
    expect((await actions(acc.jwt, {
      action: "apply", operation_id: crypto.randomUUID(), operations: d.operations,
      authorization: { kind: "approved_proposal", proposal_id: d.proposal_id, proposal_revision: d.proposal_revision, removal_confirmed: true },
    })).status).toBe(200);
    fireEvent.click(within(card).getByRole("button", { name: "Review removal of Get your SIN" }));
    expect(await within(await screen.findByRole("dialog")).findByText(en.taskActions.removed, {}, { timeout: 10_000 })).toBeTruthy();
    await waitFor(() => expect(within(dialog()).queryByRole("heading", { name: "Remove “Get your SIN”?" })).toBeNull());
    expect(within(dialog()).queryByRole("button", { name: "Remove task" })).toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(within(screen.getByTestId("task-removal-card")).queryByRole("button", { name: "Review removal of Get your SIN" })).toBeNull(), { timeout: 10_000 });
    expect(removals(acc.id)).toBe(1);
  });
});

if (!enabled) {
  it("local stack checks are skipped: ACTIONS_API_URL, ACTIONS_ANON_KEY and ACTIONS_SERVICE_ROLE_KEY are not set", () => {
    expect(enabled).toBe(false);
  });
}
