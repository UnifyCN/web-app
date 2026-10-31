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
import {
  TASK_PROPOSAL_ROOT,
  taskProposalKey,
} from "@/lib/companionActions/queryKeys";
import type { QueryClient } from "@tanstack/react-query";

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

// Save title and Not now replies that arrive after the account changed (#363 review
// S363-1 / F2). Each intent belongs to the account and epoch it started in. The reply
// is held at the transport after the stand-in answered, so it carries that account's
// private draft. A late reply must not put it back after the account scope removed
// it, nor write it under a later epoch of the same account; the same established
// account keeps it.
describe("late Save title and Not now replies stay with their account", () => {
  const REVISED = "Private revised task A";
  type Intent = "revise" | "cancel";
  /** Cached drafts of one account (a disabled read with no draft id holds nothing). */
  const proposalEntries = (client: QueryClient, id: string) =>
    client
      .getQueryCache()
      .findAll({ queryKey: [TASK_PROPOSAL_ROOT, id] })
      .filter((q) => q.state.data !== undefined || q.queryKey[2] !== null);

  /** Opens the draft, starts `intent` and holds its reply after the stand-in answered. */
  async function startHeld(intent: Intent, refused = false) {
    server = scriptedServer();
    globalThis.fetch = server.fetch as typeof fetch;
    generateReply.mockResolvedValue(reply("Answer.", PHONE));
    const { queryClient } = mount(<CompanionPage />);
    const owner = account.id as string;
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
    await waitFor(() =>
      expect(
        within(drawer)
          .getByRole("button", { name: /^Add 1 task/ })
          .getAttribute("aria-disabled"),
      ).toBe("false"),
    );
    const proposalId = server.drafts()[0].proposal_id as string;
    expect(
      queryClient.getQueryData(taskProposalKey(owner, proposalId)),
    ).toBeTruthy();
    const transport = globalThis.fetch;
    let release: (() => void) | null = null;
    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      const answered = await transport(input, init);
      if (JSON.parse(String(init?.body)).action !== intent) return answered;
      await new Promise<void>((r) => (release = r));
      return refused
        ? new Response(JSON.stringify({ error: "forbidden" }), { status: 403 })
        : answered;
    }) as typeof fetch;
    if (intent === "revise") {
      fireEvent.change(within(drawer).getByLabelText("Task title"), {
        target: { value: REVISED },
      });
      fireEvent.click(
        within(drawer).getByRole("button", { name: "Save title" }),
      );
    } else {
      fireEvent.click(within(drawer).getByRole("button", { name: "Not now" }));
    }
    await waitFor(() => expect(release).not.toBeNull());
    return {
      queryClient,
      owner,
      proposalId,
      drawer,
      release: () => act(async () => release!()),
    };
  }
  const settle = async () => {
    for (let i = 0; i < 5; i += 1) await act(async () => {});
  };

  for (const intent of ["revise", "cancel"] as const) {
    it(`${intent}: a reply after another account signed in does not restore the draft`, async () => {
      const { queryClient, owner, proposalId, release } =
        await startHeld(intent);
      const before = server.sent.length;
      act(() => account.set("web-user-B"));
      await waitFor(() =>
        expect(proposalEntries(queryClient, owner)).toHaveLength(0),
      );
      await release();
      await settle();
      expect(
        queryClient.getQueryData(taskProposalKey(owner, proposalId)),
      ).toBeUndefined();
      expect(proposalEntries(queryClient, owner)).toHaveLength(0);
      expect(proposalEntries(queryClient, "web-user-B")).toHaveLength(0);
      // The open review is A's: nothing reads A's draft as B.
      expect(
        server.sent.slice(before).filter((b) => b.action === "proposal"),
      ).toEqual([]);
      expect(screen.queryByText(REVISED)).toBeNull();
      // The drawer closes (after its exit motion) for the new account.
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });

    it(`${intent}: a reply after sign-out does not restore the draft`, async () => {
      const { queryClient, owner, proposalId, release } =
        await startHeld(intent);
      act(() => account.set(null));
      await waitFor(() =>
        expect(proposalEntries(queryClient, owner)).toHaveLength(0),
      );
      await release();
      await settle();
      expect(
        queryClient.getQueryData(taskProposalKey(owner, proposalId)),
      ).toBeUndefined();
      expect(proposalEntries(queryClient, owner)).toHaveLength(0);
      expect(screen.queryByText(REVISED)).toBeNull();
    });

    it(`${intent}: a reply after sign-out and the same account signing back in is not written under the new session`, async () => {
      const { queryClient, owner, proposalId, release } =
        await startHeld(intent);
      const before = server.sent.length;
      act(() => account.set(null));
      await waitFor(() =>
        expect(proposalEntries(queryClient, owner)).toHaveLength(0),
      );
      act(() => account.set(owner));
      await release();
      await settle();
      expect(
        queryClient.getQueryData(taskProposalKey(owner, proposalId)),
      ).toBeUndefined();
      expect(proposalEntries(queryClient, owner)).toHaveLength(0);
      expect(
        server.sent.slice(before).filter((b) => b.action === "proposal"),
      ).toEqual([]);
    });

    it(`${intent}: the same established account keeps the reply and shows it`, async () => {
      const { queryClient, owner, proposalId, drawer, release } =
        await startHeld(intent);
      act(() => account.set(owner));
      await release();
      if (intent === "revise") {
        expect(
          await within(drawer).findByRole("button", {
            name: `Add 1 task to Checklist: ${REVISED}`,
          }),
        ).toBeTruthy();
      } else {
        expect(
          await within(drawer).findByText(
            "You closed this draft. Nothing was added.",
          ),
        ).toBeTruthy();
      }
      expect(
        queryClient.getQueryData(taskProposalKey(owner, proposalId)),
      ).toMatchObject(
        intent === "revise"
          ? { status: "draft", operation: { title: REVISED } }
          : { status: "cancelled" },
      );
    });
  }

  it("a late refusal for the same established account is still shown", async () => {
    const { drawer, release } = await startHeld("cancel", true);
    await release();
    expect(
      await within(drawer).findByText("Could not save. Nothing changed."),
    ).toBeTruthy();
  });
});

// Retry of a draft's approval after the first apply never reached the server (#363
// review F1). Retry repeats the reviewed operation with its own operation identity,
// so it is allowed only while the draft still shows that reviewed title. A changed
// title, saved or not, needs its own review: saving it makes a new revision whose
// approval is a new change. An unknown outcome stays a lookup only.
describe("Retry of an approved draft follows the shown title", () => {
  const SIM = "Get a Canadian SIM card";
  /** The first apply is lost before the server; then status answers `lookups` in order. */
  function lostFirstApply(
    lookups: Array<"not_applied" | "network-error"> = [],
  ) {
    let dropped = false;
    server = scriptedServer(
      {},
      {
        override: (body): TransportReply | "network-error" | undefined => {
          if (body.action === "apply" && !dropped) {
            dropped = true;
            return "network-error";
          }
          if (body.action === "status" && lookups.length) {
            const next = lookups.shift()!;
            return next === "network-error"
              ? "network-error"
              : { status: 200, body: { status: next } };
          }
          return undefined;
        },
      },
    );
    globalThis.fetch = server.fetch as typeof fetch;
  }
  async function approvedThenLost() {
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
    const drawer = await screen.findByRole("dialog");
    const approve = await within(drawer).findByRole("button", {
      name: `Add 1 task to Checklist: ${PHONE}`,
    });
    await waitFor(() =>
      expect(approve.getAttribute("aria-disabled")).not.toBe("true"),
    );
    fireEvent.click(approve);
    return drawer;
  }
  const disabled = (drawer: HTMLElement, name: string | RegExp) =>
    within(drawer)
      .getByRole("button", { name })
      .getAttribute("aria-disabled") === "true";
  const typeTitle = (drawer: HTMLElement, value: string) =>
    fireEvent.change(within(drawer).getByLabelText("Task title"), {
      target: { value },
    });
  const settle = async () => {
    for (let i = 0; i < 8; i += 1) await act(async () => {});
  };

  it("an unsaved title edit after confirmed-not-applied cannot retry the old reviewed title", async () => {
    lostFirstApply();
    const drawer = await approvedThenLost();
    const retry = await within(drawer).findByRole("button", {
      name: "Try again",
    });
    await waitFor(() =>
      expect(retry.getAttribute("aria-disabled")).not.toBe("true"),
    );
    typeTitle(drawer, SIM);
    expect(disabled(drawer, /^Add 1 task/)).toBe(true);
    expect(disabled(drawer, "Try again")).toBe(true);
    fireEvent.click(within(drawer).getByRole("button", { name: "Try again" }));
    await settle();
    expect(server.customTasks()).toEqual([]);
    expect(creates()).toHaveLength(1);
  });

  it("putting the reviewed title back allows Retry of the same operation", async () => {
    lostFirstApply();
    const drawer = await approvedThenLost();
    await within(drawer).findByRole("button", { name: "Try again" });
    typeTitle(drawer, SIM);
    typeTitle(drawer, PHONE);
    await waitFor(() => expect(disabled(drawer, "Try again")).toBe(false));
    fireEvent.click(within(drawer).getByRole("button", { name: "Try again" }));
    await within(drawer).findByText(`Added to Checklist: ${PHONE}`);
    expect(creates()).toHaveLength(2);
    expect(new Set(creates().map((b) => b.operation_id)).size).toBe(1);
    expect(creates()[1].operations).toEqual(creates()[0].operations);
    expect(server.customTasks().map((t) => t.title)).toEqual([PHONE]);
  });

  it("a saved title edit after confirmed-not-applied replaces the old approval with a review of the new title", async () => {
    lostFirstApply();
    const drawer = await approvedThenLost();
    await within(drawer).findByRole("button", { name: "Try again" });
    typeTitle(drawer, SIM);
    await waitFor(() => expect(disabled(drawer, "Save title")).toBe(false));
    fireEvent.click(within(drawer).getByRole("button", { name: "Save title" }));
    const approve = await within(drawer).findByRole("button", {
      name: `Add 1 task to Checklist: ${SIM}`,
    });
    await waitFor(() =>
      expect(approve.getAttribute("aria-disabled")).toBe("false"),
    );
    expect(
      within(drawer).queryByRole("button", { name: "Try again" }),
    ).toBeNull();
    expect(server.customTasks()).toEqual([]);
    fireEvent.click(approve);
    await within(drawer).findByText(`Added to Checklist: ${SIM}`);
    expect(creates()).toHaveLength(2);
    expect(creates()[1].operation_id).not.toBe(creates()[0].operation_id);
    expect(creates()[1].operations[0].title).toBe(SIM);
    expect(creates()[1].authorization).toMatchObject({
      kind: "approved_proposal",
      proposal_revision: 2,
    });
    expect(server.customTasks().map((t) => t.title)).toEqual([SIM]);
  });

  it("while the outcome is unknown an edit allows only Check again, never a write or a title save", async () => {
    lostFirstApply(["network-error", "not_applied"]);
    const drawer = await approvedThenLost();
    await within(drawer).findByText(/could not check/i);
    typeTitle(drawer, SIM);
    expect(
      within(drawer).queryByRole("button", { name: "Try again" }),
    ).toBeNull();
    expect(disabled(drawer, "Save title")).toBe(true);
    expect(disabled(drawer, /^Add 1 task/)).toBe(true);
    expect(disabled(drawer, "Check again")).toBe(false);
    fireEvent.click(within(drawer).getByRole("button", { name: "Save title" }));
    fireEvent.click(
      within(drawer).getByRole("button", { name: "Check again" }),
    );
    await within(drawer).findByRole("button", { name: "Try again" });
    expect(disabled(drawer, "Try again")).toBe(true);
    fireEvent.click(within(drawer).getByRole("button", { name: "Try again" }));
    await settle();
    expect(creates()).toHaveLength(1);
    expect(server.sent.filter((b) => b.action === "revise")).toHaveLength(0);
    expect(server.customTasks()).toEqual([]);
  });
});
