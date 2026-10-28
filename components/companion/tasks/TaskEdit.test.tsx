// @vitest-environment jsdom
//
// Mounted acceptance for editing existing Checklist tasks through Companion on web
// (mobile-app#365): the real Companion and Checklist pages, the real send hook,
// card, drawer and controls, the real client, store and query cache. Conversations
// and AI answers are controlled stand-ins (services/companion); the action service is
// the scripted contract stand-in in taskActionsTestHarness.tsx. Authorization,
// revisions, receipts and persistence are proven against the real endpoint and
// database in supabase/tests/companion-actions (run.sh).
import { useSyncExternalStore } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Providers,
  newQueryClient,
  scriptedServer,
} from "./taskActionsTestHarness";

// ---------------------------------------------------------------- stand-ins
const account = {
  id: "web-user-1" as string | null,
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
vi.mock("@/hooks/useLanguage", () => ({
  useLanguage: () => ({ currentLanguage: "en" }),
}));
const capture = vi.fn();
vi.mock("@/lib/posthog", () => ({
  isPostHogConfigured: () => true,
  posthog: { capture: (...args: unknown[]) => capture(...args) },
}));
vi.mock("@/lib/confetti", () => ({ fireTaskConfetti: () => {} }));
vi.mock("@/services/checklist", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/checklist")>();
  return {
    ...actual,
    // The legacy Checklist read: one published task and the stand-in's live custom tasks.
    getTasks: vi.fn(async () => [
      {
        id: "sin",
        priority: "Do now",
        title: "Get a SIN",
        description: "",
        completed: false,
        completedAt: null,
        dismissedAt: null,
        isCustom: false,
      },
      ...server.customTasks().map((t) => ({
        id: t.id,
        priority: t.priority,
        title: t.title,
        description: t.description,
        completed: false,
        completedAt: null,
        dismissedAt: null,
        isCustom: true,
      })),
    ]),
  };
});
// Conversations and AI answers: controlled stand-ins. The send hook is real.
const CONV = "c0000000-0000-4000-8000-000000000001";
const saved: Array<{
  id: number;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
}> = [];
let nextMessageId = 100;
const generateReply = vi.fn();
vi.mock("@/services/companion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/companion")>();
  return {
    ...actual,
    getConversations: vi.fn(async () =>
      saved.length
        ? [{ id: CONV, title: "First week", updatedAt: "2026-10-26T10:00:00Z" }]
        : [],
    ),
    getMessages: vi.fn(async (id: string) =>
      saved
        .filter((m) => m.conversationId === id)
        .map((m) => ({
          ...m,
          sources: null,
          createdAt: "2026-10-26T10:00:00Z",
        })),
    ),
    createConversation: vi.fn(async () => ({
      id: CONV,
      title: "First week",
      updatedAt: "2026-10-26T10:00:00Z",
    })),
    saveMessage: vi.fn(
      async (input: {
        conversationIdentifier: string;
        role: "user" | "assistant";
        content: string;
      }) => {
        const m = {
          id: nextMessageId++,
          conversationId: input.conversationIdentifier,
          role: input.role,
          content: input.content,
        };
        saved.push(m);
        server.saveMessage(m.id, m.role, m.content, m.conversationId);
        return { ...m, sources: null, createdAt: "2026-10-26T10:00:00Z" };
      },
    ),
    generateReply: (...args: unknown[]) => generateReply(...args),
    getChatbotUsage: vi.fn(async () => ({ messageCount: 0, isPremium: false })),
  };
});
vi.mock("@/hooks/useProfile", () => ({
  useCurrentUser: () => ({
    data: account.id ? { id: account.id, onboarding: null } : null,
  }),
}));
vi.mock("@/components/companion/ConversationList", () => ({
  ConversationList: () => null,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/companion",
  useSearchParams: () => new URLSearchParams(),
}));

import ChecklistPage from "@/app/(main)/checklist/page";
import CompanionPage from "@/app/(main)/companion/page";
import { clearTaskActionStores } from "@/lib/companionActions/taskActionStore";
import { clearComposerDrafts } from "@/lib/companion/composerDrafts";

// ---------------------------------------------------------------- helpers
let server: ReturnType<typeof scriptedServer>;
const realFetch = globalThis.fetch;
function useServer(s: ReturnType<typeof scriptedServer>) {
  server = s;
  globalThis.fetch = s.fetch as typeof fetch;
}

function mount(node: React.ReactNode) {
  const queryClient = newQueryClient();
  const view = render(<Providers queryClient={queryClient}>{node}</Providers>);
  return { ...view, queryClient };
}

const PHONE = "Get a phone plan";
const SIN = "Get a SIN";
const reply = (answer: string, edit: Record<string, unknown> | null) => ({
  answer,
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
  actionEdit: edit ? { type: "task.edit", ...edit } : null,
});

async function send(text: string) {
  const box = screen.getByRole("textbox", { name: /message/i });
  fireEvent.change(box, { target: { value: text } });
  fireEvent.keyDown(box, { key: "Enter" });
}
const writes = () => server.sent.filter((b) => b.action === "apply");
const priorityOf = (ref: string) =>
  server.customTasks().find((t) => `custom:${t.id}` === ref)?.priority;
async function openEditDraft(title = PHONE) {
  const card = await screen.findByRole("article", {
    name: `Suggested change: ${title}`,
  });
  fireEvent.click(
    within(card).getByRole("button", {
      name: `Review the suggested change to ${title}`,
    }),
  );
  const drawer = await screen.findByRole("dialog", { name: "Review change" });
  return { card, drawer };
}
async function approveButton(drawer: HTMLElement, title = PHONE) {
  const approve = await within(drawer).findByRole("button", {
    name: `Save this change to ${title}`,
  });
  await waitFor(() =>
    expect(approve.getAttribute("aria-disabled")).not.toBe("true"),
  );
  return approve;
}

let phoneRef: string;
beforeEach(() => {
  // jsdom has no layout: the chat panel scrolls its end marker into view.
  Element.prototype.scrollIntoView = () => {};
  clearTaskActionStores(null);
  clearComposerDrafts(null);
  saved.length = 0;
  nextMessageId = 100;
  account.set("web-user-1");
  generateReply.mockReset();
  capture.mockReset();
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    get: () => true,
  });
  useServer(scriptedServer({}, { published: { "sanity:sin": SIN } }));
  phoneRef = server.addCustomTask(PHONE);
});
afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
});

// ---------------------------------------------------------------- tests
describe("Edit existing tasks through Companion (web)", () => {
  it("a clear rename command saves exactly that change without an AI answer, names it in the card, and Checklist reads the new title", async () => {
    mount(<CompanionPage />);
    await send(`Rename task "${PHONE}" to "Get a prepaid plan"`);
    const card = await screen.findByRole("article", {
      name: "Changed in Checklist: Get a prepaid plan",
    });
    expect(
      within(card).getByText("Title: “Get a phone plan” → “Get a prepaid plan”"),
    ).toBeTruthy();
    expect(generateReply).not.toHaveBeenCalled();
    expect(writes()).toHaveLength(1);
    expect(writes()[0].authorization).toEqual({
      kind: "direct_command",
      message_id: saved[0].id,
    });
    expect(writes()[0].operations).toEqual([
      {
        type: "task.edit_details",
        task_ref: phoneRef,
        expected_revision: 1,
        title: "Get a prepaid plan",
      },
    ]);
    cleanup();
    mount(<ChecklistPage />);
    expect(await screen.findByText("Get a prepaid plan")).toBeTruthy();
    expect(screen.queryByText(PHONE)).toBeNull();
  });

  it("a state command names a published task by its Checklist title and saves only its state", async () => {
    mount(<CompanionPage />);
    await send(`Mark task "${SIN}" as waiting: Appointment on Friday`);
    expect(
      await screen.findByRole("article", {
        name: `${SIN}: Not started → Waiting`,
      }),
    ).toBeTruthy();
    expect(writes()[0].operations).toEqual([
      {
        type: "task.set_state",
        task_ref: "sanity:sin",
        state: "waiting",
        expected_revision: 0,
        waiting_reason: "Appointment on Friday",
      },
    ]);
    expect(server.row("sanity:sin")).toMatchObject({
      state: "waiting",
      reason: "Appointment on Friday",
    });
  });

  it("an ambiguous or unknown target asks a question and writes nothing", async () => {
    server.addCustomTask(PHONE);
    mount(<CompanionPage />);
    await send(`Set priority of task "${PHONE}" to Do now`);
    expect(
      await screen.findByText(
        `2 tasks are called “${PHONE}”, so I did not change any of them. Open the one you mean in Checklist and change it there.`,
      ),
    ).toBeTruthy();
    await send('Rename task "Get a bus pass" to "Get a transit pass"');
    expect(
      await screen.findByText(/I could not find a Checklist task with that title/),
    ).toBeTruthy();
    expect(writes()).toHaveLength(0);
    expect(generateReply).not.toHaveBeenCalled();
  });

  it("a suggested change is a draft until approved; approval saves the reviewed change once, and the typed message and focus stay", async () => {
    generateReply.mockResolvedValue(
      reply("Since the store is closing, do it today.", {
        taskRef: phoneRef,
        field: "priority",
        value: "Do now",
      }),
    );
    mount(<CompanionPage />);
    await send("The phone store closes tomorrow");
    const card = await screen.findByRole("article", {
      name: `Suggested change: ${PHONE}`,
    });
    expect(within(card).getByText("Draft · not saved yet")).toBeTruthy();
    expect(within(card).getByText("Priority: Do now")).toBeTruthy();
    expect(priorityOf(phoneRef)).toBe("Do soon");
    expect(writes()).toHaveLength(0);
    const box = screen.getByRole("textbox", { name: /message/i });
    fireEvent.change(box, { target: { value: "My next question" } });

    const review = within(card).getByRole("button", {
      name: `Review the suggested change to ${PHONE}`,
    });
    review.focus();
    fireEvent.click(review);
    const drawer = await screen.findByRole("dialog", { name: "Review change" });
    expect(within(drawer).getByText("Now: Do soon")).toBeTruthy();
    expect(within(drawer).getByText("After you save: Do now")).toBeTruthy();
    const approve = await approveButton(drawer);
    fireEvent.click(approve);
    fireEvent.click(approve);
    expect(
      await within(drawer).findByText(`Changed in Checklist: ${PHONE}`),
    ).toBeTruthy();
    expect(within(drawer).getByText("Priority: Do soon → Do now")).toBeTruthy();
    expect(writes()).toHaveLength(1);
    expect(writes()[0].authorization).toEqual({
      kind: "approved_proposal",
      proposal_id: server.drafts()[0].proposal_id,
      proposal_revision: 1,
    });
    expect(priorityOf(phoneRef)).toBe("Do now");
    // Analytics: categorical only, never the title or the value.
    const events = capture.mock.calls.filter(
      (c) => c[0] === "companion_action_result",
    );
    expect(events.at(-1)?.[1]).toEqual({
      operation_type: "task.edit_details",
      action: "approve_edit",
      outcome: "applied",
      entry_surface: "companion",
    });
    expect(JSON.stringify(events)).not.toContain(PHONE);

    fireEvent.keyDown(drawer, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
      (screen.getByRole("textbox", { name: /message/i }) as HTMLTextAreaElement)
        .value,
    ).toBe("My next question");
    await within(card).findByText("Saved in Checklist");
  });

  it("a newer edit elsewhere gives a revised draft that shows the old and current values and needs its own approval", async () => {
    generateReply.mockResolvedValue(
      reply("Do it today.", {
        taskRef: phoneRef,
        field: "priority",
        value: "Do now",
      }),
    );
    mount(<CompanionPage />);
    await send("The phone store closes tomorrow");
    const { drawer } = await openEditDraft();
    // Another device changes the priority while this review is open.
    server.editDetailsElsewhere(phoneRef, { priority: "Explore and connect" });
    fireEvent.click(await approveButton(drawer));
    expect(
      await within(drawer).findByText(
        "This task changed after the change was suggested. Check the current values before you save.",
      ),
    ).toBeTruthy();
    expect(within(drawer).getByText("Now: Explore and connect")).toBeTruthy();
    expect(within(drawer).getByText("When suggested: Do soon")).toBeTruthy();
    expect(priorityOf(phoneRef)).toBe("Explore and connect");
    expect(writes()).toHaveLength(1);

    fireEvent.click(await approveButton(drawer));
    expect(
      await within(drawer).findByText("Priority: Explore and connect → Do now"),
    ).toBeTruthy();
    expect(writes()).toHaveLength(2);
    expect(writes()[1].authorization.proposal_revision).toBe(2);
    expect(priorityOf(phoneRef)).toBe("Do now");
  });
});


it("keeps the first direct edit receipt and marks it historical after a second edit", async () => {
  const { queryClient } = mount(<CompanionPage />);
  await send(`Rename task "${PHONE}" to "Mobile plan"`);
  const first = await screen.findByRole("article", {
    name: "Changed in Checklist: Mobile plan",
  });
  await send('Rename task "Mobile plan" to "Prepaid plan"');
  await screen.findByRole("article", {
    name: "Changed in Checklist: Prepaid plan",
  });
  await waitFor(() => {
    const data = queryClient.getQueryData<{
      commands: Array<{ receipt: { current: boolean } }>;
    }>(["companion-conversation-actions", account.id, CONV]);
    expect(data?.commands[0]?.receipt.current).toBe(false);
  });
  expect(await within(first).findByText(/This task changed after this/)).toBeTruthy();
  expect(within(first).getByText("Changed in Checklist: Mobile plan")).toBeTruthy();
  expect(within(first).getByText("Title: “Get a phone plan” → “Mobile plan”")).toBeTruthy();
});

// #365 review S365-002 (red first): a reason-only state command names both reasons.
it("a waiting reason change names the reason before and after on the command card, and keeps them after a later edit", async () => {
  // Wrong if: the card says only Waiting → Waiting, shows other reasons than the saved
  // ones, or loses them when the receipt becomes history.
  mount(<CompanionPage />);
  await send(`Mark task "${PHONE}" as waiting: Appointment on Friday`);
  const first = await screen.findByRole("article", {
    name: `${PHONE}: Not started → Waiting`,
  });
  expect(
    within(first).getByText("Waiting for: (empty) → “Appointment on Friday”"),
  ).toBeTruthy();
  await send(`Mark task "${PHONE}" as waiting: Appointment on Monday`);
  const second = await screen.findByRole("article", {
    name: `${PHONE}: Waiting → Waiting`,
  });
  expect(
    within(second).getByText(
      "Waiting for: “Appointment on Friday” → “Appointment on Monday”",
    ),
  ).toBeTruthy();
  expect(server.row(phoneRef)).toMatchObject({
    state: "waiting",
    reason: "Appointment on Monday",
  });
  // A later edit makes the second receipt history; it keeps its saved reasons.
  await send(`Rename task "${PHONE}" to "Prepaid plan"`);
  await screen.findByRole("article", {
    name: "Changed in Checklist: Prepaid plan",
  });
  expect(await within(second).findByText(/This task changed after this/)).toBeTruthy();
  expect(
    within(second).getByText(
      "Waiting for: “Appointment on Friday” → “Appointment on Monday”",
    ),
  ).toBeTruthy();
  // The private reason text never reaches analytics.
  expect(capture.mock.calls.length).toBeGreaterThan(0);
  expect(JSON.stringify(capture.mock.calls)).not.toContain("Appointment on");
});
