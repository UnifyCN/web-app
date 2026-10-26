// @vitest-environment jsdom
//
// Mounted acceptance for adding one Checklist task through Companion on web
// (mobile-app#363): the real Companion and Checklist pages, the real send hook,
// card, drawer and controls, the real client, store and query cache. Conversations
// and AI answers are controlled stand-ins (services/companion); the action service is
// the scripted contract stand-in in taskActionsTestHarness.tsx. Authorization,
// revisions, receipts and persistence are proven against the real endpoint and
// database in supabase/tests/companion-actions (run.sh).
import { useSyncExternalStore } from "react";
import {
  act,
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
  type TransportReply,
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
    // The legacy Checklist read: the stand-in's live custom tasks.
    getTasks: vi.fn(async () =>
      server.customTasks().map((t) => ({
        id: t.id,
        priority: "Do soon",
        title: t.title,
        description: "",
        completed: false,
        completedAt: null,
        dismissedAt: null,
        isCustom: true,
      })),
    ),
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
import { ChatLimitError } from "@/services/companion";
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

const PHONE = "Set up phone service";
const reply = (answer: string, title: string | null) => ({
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
  actionProposal: title
    ? { type: "task.create_custom", version: 1, title }
    : null,
});

async function send(text: string) {
  const box = screen.getByRole("textbox", { name: /message/i });
  fireEvent.change(box, { target: { value: text } });
  fireEvent.keyDown(box, { key: "Enter" });
}

const creates = () =>
  server.sent.filter(
    (b) =>
      b.action === "apply" && b.operations?.[0]?.type === "task.create_custom",
  );

beforeEach(() => {
  // jsdom has no layout: the chat panel scrolls its end marker into view.
  Element.prototype.scrollIntoView = () => {};
  // Stores and drafts live per account outside React: start each test empty.
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
});
afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
});

// ---------------------------------------------------------------- tests
describe("Add one task through Companion (web)", () => {
  it("shows a suggested task as a draft, reviews its exact title and context, adds it once, and Checklist reads the same task", async () => {
    useServer(scriptedServer());
    generateReply.mockResolvedValue(
      reply("A phone plan helps with both.", PHONE),
    );
    mount(<CompanionPage />);
    await send("What else do I need for my first week in Vancouver?");

    const card = await screen.findByRole("article", {
      name: `Suggested task: ${PHONE}`,
    });
    expect(
      within(card).getByText("Draft · not in your Checklist yet"),
    ).toBeTruthy();
    expect(server.customTasks()).toEqual([]);
    expect(creates()).toHaveLength(0);

    fireEvent.click(
      within(card).getByRole("button", {
        name: `Review the suggested task ${PHONE}`,
      }),
    );
    const drawer = await screen.findByRole("dialog", {
      name: "Review new task",
    });
    expect(
      (within(drawer).getByLabelText("Task title") as HTMLInputElement).value,
    ).toBe(PHONE);
    expect(within(drawer).getByText("City: Vancouver")).toBeTruthy();
    expect(within(drawer).getByText("Province: British Columbia")).toBeTruthy();
    const approve = await within(drawer).findByRole("button", {
      name: `Add 1 task to Checklist: ${PHONE}`,
    });
    expect(approve.textContent).toContain("Add 1 task to Checklist");
    await waitFor(() =>
      expect(approve.getAttribute("aria-disabled")).not.toBe("true"),
    );

    fireEvent.click(approve);
    fireEvent.click(approve);
    expect(
      await within(drawer).findByText(`Added to Checklist: ${PHONE}`),
    ).toBeTruthy();
    expect(creates()).toHaveLength(1);
    expect(server.customTasks().map((t) => t.title)).toEqual([PHONE]);
    expect(creates()[0].authorization).toEqual({
      kind: "approved_proposal",
      proposal_id: server.drafts()[0].proposal_id,
      proposal_revision: 1,
    });

    // The card in the conversation is now a historical receipt of the saved task.
    fireEvent.click(within(drawer).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await within(card).findByText(`Added to Checklist: ${PHONE}`);

    // Checklist reads the same task.
    cleanup();
    mount(<ChecklistPage />);
    expect(await screen.findByText(PHONE)).toBeTruthy();
  });

  it("keeps the typed message and focus through review, approval and Escape", async () => {
    useServer(scriptedServer());
    generateReply.mockResolvedValue(reply("Answer.", PHONE));
    mount(<CompanionPage />);
    await send("Phone plan?");
    const card = await screen.findByRole("article", {
      name: `Suggested task: ${PHONE}`,
    });
    const box = screen.getByRole("textbox", { name: /message/i });
    fireEvent.change(box, { target: { value: "My next question" } });
    const review = within(card).getByRole("button", {
      name: `Review the suggested task ${PHONE}`,
    });
    review.focus();
    fireEvent.click(review);
    const drawer = await screen.findByRole("dialog", {
      name: "Review new task",
    });
    const approve = await within(drawer).findByRole("button", {
      name: `Add 1 task to Checklist: ${PHONE}`,
    });
    await waitFor(() =>
      expect(approve.getAttribute("aria-disabled")).not.toBe("true"),
    );
    approve.focus();
    fireEvent.click(approve);
    await within(drawer).findByText(`Added to Checklist: ${PHONE}`);
    // Focus stays inside the drawer after the update.
    expect(drawer.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
      (screen.getByRole("textbox", { name: /message/i }) as HTMLTextAreaElement)
        .value,
    ).toBe("My next question");
    expect(document.activeElement?.textContent).toMatch(/Review|View task/);
  });

  it("a clear command adds exactly its task without an AI answer; an unclear one asks and writes nothing", async () => {
    useServer(scriptedServer());
    mount(<CompanionPage />);
    await send("Add task: Buy a transit pass");
    expect(
      await screen.findByText("Added to Checklist: Buy a transit pass"),
    ).toBeTruthy();
    expect(generateReply).not.toHaveBeenCalled();
    expect(creates()).toHaveLength(1);
    expect(creates()[0].authorization).toEqual({
      kind: "direct_command",
      message_id: saved[0].id,
    });

    await send("Add a task");
    expect(
      await screen.findByText(/Which task do you want to add\?/),
    ).toBeTruthy();
    expect(generateReply).not.toHaveBeenCalled();
    expect(creates()).toHaveLength(1);
    expect(server.customTasks().map((t) => t.title)).toEqual([
      "Buy a transit pass",
    ]);
  });

  it("a lost reply is looked up first; pending and failed lookups never write; not applied retries the same operation", async () => {
    let mode: "drop" | "pending" | "lookup_fail" | null = "drop";
    const s = scriptedServer(
      {},
      {
        override: (body): TransportReply | "network-error" | undefined => {
          if (body.action === "apply" && mode === "drop") {
            mode = "pending";
            return "network-error"; // the write never reached the server
          }
          if (body.action === "status" && mode === "pending") {
            mode = "lookup_fail";
            return { status: 200, body: { status: "pending" } };
          }
          if (body.action === "status" && mode === "lookup_fail") {
            mode = null;
            return "network-error";
          }
          return undefined;
        },
      },
    );
    useServer(s);
    generateReply.mockResolvedValue(reply("Answer.", PHONE));
    mount(<CompanionPage />);
    await send("Phone?");
    const card = await screen.findByRole("article", {
      name: `Suggested task: ${PHONE}`,
    });
    fireEvent.click(
      within(card).getByRole("button", {
        name: `Review the suggested task ${PHONE}`,
      }),
    );
    const drawer = await screen.findByRole("dialog", {
      name: "Review new task",
    });
    const approve = await within(drawer).findByRole("button", {
      name: `Add 1 task to Checklist: ${PHONE}`,
    });
    await waitFor(() =>
      expect(approve.getAttribute("aria-disabled")).not.toBe("true"),
    );
    fireEvent.click(approve);
    await within(drawer).findByText(/still being saved/i);
    expect(
      within(drawer).queryByRole("button", { name: /^Try again$/ }),
    ).toBeNull();
    fireEvent.click(
      within(drawer).getByRole("button", { name: "Check again" }),
    );
    await within(drawer).findByText(/could not check/i);
    fireEvent.click(
      within(drawer).getByRole("button", { name: "Check again" }),
    );
    const retry = await within(drawer).findByRole("button", {
      name: "Try again",
    });
    const firstId = creates()[0].operation_id;
    fireEvent.click(retry);
    await within(drawer).findByText(`Added to Checklist: ${PHONE}`);
    expect(new Set(creates().map((b) => b.operation_id))).toEqual(
      new Set([firstId]),
    );
    expect(server.customTasks()).toHaveLength(1);
  });

  it("an edited title and a changed profile each need a new approval of the shown revision", async () => {
    useServer(scriptedServer());
    generateReply.mockResolvedValue(reply("Answer.", PHONE));
    mount(<CompanionPage />);
    await send("Phone?");
    const card = await screen.findByRole("article", {
      name: `Suggested task: ${PHONE}`,
    });
    fireEvent.click(
      within(card).getByRole("button", {
        name: `Review the suggested task ${PHONE}`,
      }),
    );
    const drawer = await screen.findByRole("dialog", {
      name: "Review new task",
    });
    const input = within(drawer).getByLabelText("Task title");
    fireEvent.change(input, { target: { value: "Get a Canadian SIM card" } });
    // An unsaved edit cannot be approved.
    expect(
      within(drawer)
        .getByRole("button", { name: /^Add 1 task to Checklist/ })
        .getAttribute("aria-disabled"),
    ).toBe("true");
    fireEvent.click(within(drawer).getByRole("button", { name: "Save title" }));
    await within(drawer).findByText(
      "You changed the title. Check it, then add the task.",
    );

    server.setProfile({
      city: "Toronto",
      province: "Ontario",
      arrival_date: "2026-11-02",
    });
    const approve = await within(drawer).findByRole("button", {
      name: "Add 1 task to Checklist: Get a Canadian SIM card",
    });
    await waitFor(() =>
      expect(approve.getAttribute("aria-disabled")).not.toBe("true"),
    );
    fireEvent.click(approve);
    await within(drawer).findByText(
      "Your profile changed since this draft was made. Check it again before you add the task.",
    );
    expect(within(drawer).getByText("City: Toronto")).toBeTruthy();
    expect(within(drawer).getByText("Before: Vancouver")).toBeTruthy();
    expect(server.customTasks()).toEqual([]);
    fireEvent.click(
      await within(drawer).findByRole("button", {
        name: "Add 1 task to Checklist: Get a Canadian SIM card",
      }),
    );
    await within(drawer).findByText(
      "Added to Checklist: Get a Canadian SIM card",
    );
    expect(creates().map((b) => b.authorization.proposal_revision)).toEqual([
      2, 3,
    ]);
    expect(server.customTasks().map((t) => t.title)).toEqual([
      "Get a Canadian SIM card",
    ]);
  });

  it("Undo of an added task asks first; Keep changes nothing; after a newer edit it offers a reviewed removal", async () => {
    useServer(scriptedServer());
    mount(<CompanionPage />);
    await send("Add task: Buy a transit pass");
    const card = await screen.findByRole("article", {
      name: "Added task: Buy a transit pass",
    });
    fireEvent.click(within(card).getByRole("button", { name: "View task" }));
    const drawer = await screen.findByRole("dialog");
    fireEvent.click(
      await within(drawer).findByRole("button", {
        name: "Undo adding Buy a transit pass",
      }),
    );
    expect(
      await within(drawer).findByText(
        "Remove “Buy a transit pass” from your Checklist?",
      ),
    ).toBeTruthy();
    fireEvent.click(within(drawer).getByRole("button", { name: "Keep task" }));
    expect(server.sent.filter((b) => b.action === "undo")).toHaveLength(0);

    // Another platform changes the task: Undo keeps that change and offers removal for review.
    server.editElsewhere(
      server.drafts().length ? "" : `custom:${server.customTasks()[0].id}`,
      "in_progress",
    );
    fireEvent.click(
      await within(drawer).findByRole("button", {
        name: "Undo adding Buy a transit pass",
      }),
    );
    fireEvent.click(within(drawer).getByRole("button", { name: "Remove" }));
    await within(drawer).findByText(
      "This task changed after it was added, so nothing was removed. You can still remove it.",
    );
    expect(server.customTasks()).toHaveLength(1);
    fireEvent.click(
      within(drawer).getByRole("button", { name: "Remove task" }),
    );
    await waitFor(() => expect(server.customTasks()).toHaveLength(0));
    const approval = server.sent.filter((b) => b.action === "apply").at(-1)!;
    expect(approval.authorization.removal_confirmed).toBe(true);
  });

  it("offline, approval, title edits and Not now send nothing; at the AI limit a draft can still be added", async () => {
    useServer(scriptedServer());
    generateReply.mockResolvedValueOnce(reply("Answer.", PHONE));
    mount(<CompanionPage />);
    await send("Phone?");
    const card = await screen.findByRole("article", {
      name: `Suggested task: ${PHONE}`,
    });
    // The allowance is used up: the next question gets no AI answer.
    generateReply.mockRejectedValue(new ChatLimitError("limit"));
    await send("And internet?");
    await screen.findByRole("alert");
    fireEvent.click(
      within(card).getByRole("button", {
        name: `Review the suggested task ${PHONE}`,
      }),
    );
    const drawer = await screen.findByRole("dialog", {
      name: "Review new task",
    });
    await within(drawer).findByRole("button", {
      name: `Add 1 task to Checklist: ${PHONE}`,
    });

    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => false,
    });
    act(() => void window.dispatchEvent(new Event("offline")));
    const before = server.sent.length;
    for (const name of [
      `Add 1 task to Checklist: ${PHONE}`,
      "Save title",
      "Not now",
    ]) {
      const b = within(drawer).getByRole("button", { name });
      expect(b.getAttribute("aria-disabled")).toBe("true");
      fireEvent.click(b);
    }
    expect(
      server.sent.slice(before).filter((b) => b.action !== "read"),
    ).toEqual([]);

    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => true,
    });
    act(() => void window.dispatchEvent(new Event("online")));
    const approve = within(drawer).getByRole("button", {
      name: `Add 1 task to Checklist: ${PHONE}`,
    });
    await waitFor(() =>
      expect(approve.getAttribute("aria-disabled")).not.toBe("true"),
    );
    fireEvent.click(approve);
    await within(drawer).findByText(`Added to Checklist: ${PHONE}`);
    expect(server.customTasks()).toHaveLength(1);
  });

  it("an account change hides the previous account's cards and drafts, and a late reply reaches nobody", async () => {
    let release: (() => void) | null = null;
    const s = scriptedServer(
      {},
      {
        override: (body) => {
          if (body.action !== "prepare") return undefined;
          // Hold the draft reply until the account has changed.
          return undefined;
        },
      },
    );
    useServer(s);
    const heldFetch = s.fetch;
    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      const body = JSON.parse(String(init?.body));
      if (body.action === "prepare")
        await new Promise<void>((r) => (release = r));
      return heldFetch(input, init);
    }) as typeof fetch;
    generateReply.mockResolvedValue(reply("Answer.", PHONE));
    mount(<CompanionPage />);
    await send("Phone?");
    await waitFor(() => expect(release).not.toBeNull());
    act(() => account.set("web-user-2"));
    release!();
    await new Promise((r) => setTimeout(r, 50));
    expect(
      screen.queryByRole("article", { name: `Suggested task: ${PHONE}` }),
    ).toBeNull();
    expect(screen.queryByText(PHONE)).toBeNull();
  });

  it("reports only allowlisted action results, never the task title or message", async () => {
    useServer(scriptedServer());
    mount(<CompanionPage />);
    await send("Add task: Buy a transit pass");
    await screen.findByText("Added to Checklist: Buy a transit pass");
    const events = capture.mock.calls.filter(
      ([name]) => name === "companion_action_result",
    );
    expect(events.length).toBeGreaterThan(0);
    for (const [, props] of events) {
      expect(JSON.stringify(props)).not.toMatch(/transit|Add task/i);
      expect(Object.keys(props).sort()).toEqual([
        "action",
        "entry_surface",
        "operation_type",
        "outcome",
      ]);
    }
    expect(events[0][1]).toMatchObject({
      operation_type: "task.create_custom",
      action: "command_create",
      outcome: "applied",
    });
  });
});
