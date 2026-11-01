// @vitest-environment jsdom
//
// Mounted acceptance for task steps on web (mobile-app#366): the real Checklist and
// Companion pages, the real drawer, steps controls, send hook and cards, the real
// client, store and query cache. Conversations
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
  type Body,
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
    // The legacy Checklist read: one content-backed task.
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
/** Per test: answers a request differently (a dropped reply, a pending lookup). */
let override:
  | ((body: Body) => TransportReply | "network-error" | undefined)
  | null = null;
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

beforeEach(() => {
  // jsdom has no layout: the chat panel scrolls its end marker into view.
  Element.prototype.scrollIntoView = () => {};
  // Stores and drafts live per account outside React: start each test empty.
  clearTaskActionStores(null);
  clearComposerDrafts(null);
  override = null;
  useServer(scriptedServer({}, { override: (b) => override?.(b) }));
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

import { onlineManager } from "@tanstack/react-query";

// A test that ends offline leaves React Query's global online state behind.
beforeEach(() => onlineManager.setOnline(true));

const SIN_STEPS = [
  "Review the official requirements",
  "Prepare the required documents",
  "Submit the application yourself",
];
const stepReply = (answer: string, titles: string[]) => ({
  ...reply(answer, null),
  // As services/companion returns it after parsing the rag-query field.
  actionProposal: {
    type: "step.create" as const,
    taskRef: "sanity:sin",
    titles,
  },
});
const stepApplies = () =>
  server.sent.filter(
    (b) =>
      b.action === "apply" &&
      String(b.operations?.[0]?.type).startsWith("step."),
  );
const dialog = () => screen.findByRole("dialog");
const isDisabled = (el: HTMLElement) =>
  el.getAttribute("aria-disabled") === "true" ||
  (el as HTMLButtonElement).disabled === true;
const checked = (el: HTMLElement) => (el as HTMLInputElement).checked;

async function openSteps() {
  const opener = await screen.findByRole("button", {
    name: "Task progress for Get a SIN",
  });
  opener.focus();
  fireEvent.click(opener);
  const panel = await dialog();
  const input = await within(panel).findByRole("textbox", { name: "New step" });
  await waitFor(() =>
    expect(
      isDisabled(within(panel).getByRole("radio", { name: "Waiting" })),
    ).toBe(false),
  );
  return { panel, input, opener };
}
async function addStep(panel: HTMLElement, title: string) {
  fireEvent.change(within(panel).getByRole("textbox", { name: "New step" }), {
    target: { value: title },
  });
  const add = within(panel).getByRole("button", { name: "Add step" });
  await waitFor(() => expect(isDisabled(add)).toBe(false));
  fireEvent.click(add);
  return within(panel).findByRole("checkbox", { name: title });
}
async function toggle(panel: HTMLElement, title: string, value: boolean) {
  const box = within(panel).getByRole("checkbox", { name: title });
  await waitFor(() => expect(isDisabled(box)).toBe(false));
  box.focus();
  fireEvent.click(box);
  await waitFor(() =>
    expect(checked(within(panel).getByRole("checkbox", { name: title }))).toBe(
      value,
    ),
  );
  return box;
}

describe("Task steps (web)", () => {
  it("steps added and checked in the Checklist drawer never complete the task; focus stays on the same checkbox; completion keeps the unfinished step", async () => {
    // Wrong if: the checkbox element is replaced after its save (focus lost), checking
    // every step changes the task, or completion marks the unfinished step done.
    mount(<ChecklistPage />);
    const { panel } = await openSteps();
    for (const title of SIN_STEPS) await addStep(panel, title);
    expect(
      (
        within(panel).getByRole("textbox", {
          name: "New step",
        }) as HTMLInputElement
      ).value,
    ).toBe("");
    for (const title of SIN_STEPS) {
      const box = await toggle(panel, title, true);
      await waitFor(() =>
        expect(within(panel).getByText(`Checked step: ${title}`)).toBeTruthy(),
      );
      expect(within(panel).getByRole("checkbox", { name: title })).toBe(box);
      expect(document.activeElement).toBe(box);
    }
    expect(
      await within(panel).findByText(
        "All steps are done. This task stays Not started until you mark it complete.",
      ),
    ).toBeTruthy();
    expect(
      within(panel)
        .getByRole("radio", { name: "Not started" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    await toggle(panel, SIN_STEPS[2], false);
    expect(
      within(panel).queryByRole("button", { name: "Mark task complete" }),
    ).toBeNull();
    const completed = within(panel).getByRole("radio", { name: "Completed" });
    const addUndoName = "Undo “Added step: Submit the application yourself”";
    expect(isDisabled(within(panel).getByRole("button", { name: addUndoName }))).toBe(false);
    await waitFor(() => expect(isDisabled(completed)).toBe(false));
    fireEvent.click(completed);
    expect(
      await within(panel).findByText("Completed with 2 of 3 steps done."),
    ).toBeTruthy();
    await waitFor(() =>
      expect(
        isDisabled(within(panel).getByRole("checkbox", { name: SIN_STEPS[2] })),
      ).toBe(true),
    );
    const readonlyUndo = within(panel).queryByRole("button", { name: addUndoName });
    if (readonlyUndo) {
      expect(isDisabled(readonlyUndo)).toBe(true);
      fireEvent.click(readonlyUndo);
    }
    expect(server.sent.filter(b => b.action === "undo")).toHaveLength(0);
    expect(server.steps().map((s) => [s.title, s.done])).toEqual([
      [SIN_STEPS[0], true],
      [SIN_STEPS[1], true],
      [SIN_STEPS[2], false],
    ]);
  });

  it("removal asks first and Keep sends nothing; the offered completion saves Completed; a typed step survives closing the drawer", async () => {
    // Wrong if: a removal is sent before confirmation, Undo restores another step, the
    // offered completion does not complete, or the typed step is lost on close.
    mount(<ChecklistPage />);
    const { panel } = await openSteps();
    await addStep(panel, "Bring two IDs");
    await addStep(panel, "Choose a bank");
    const removeButton = () =>
      within(panel).getByRole("button", { name: "Remove step: Bring two IDs" });
    await waitFor(() => expect(isDisabled(removeButton())).toBe(false));
    fireEvent.click(removeButton());
    fireEvent.click(
      await within(panel).findByRole("button", { name: "Keep step" }),
    );
    expect(
      stepApplies().filter((w) => w.operations[0].type === "step.remove"),
    ).toHaveLength(0);
    fireEvent.click(removeButton());
    fireEvent.click(
      await within(panel).findByRole("button", { name: "Remove step" }),
    );
    expect(
      await within(panel).findByText("Removed step: Bring two IDs"),
    ).toBeTruthy();
    const removal = stepApplies().find(
      (w) => w.operations[0].type === "step.remove",
    )!;
    expect(removal.authorization).toEqual({
      kind: "ui_control",
      removal_confirmed: true,
    });
    await waitFor(() =>
      expect(
        within(panel).queryByRole("checkbox", { name: "Bring two IDs" }),
      ).toBeNull(),
    );
    const undo = within(panel).getByRole("button", {
      name: "Undo “Removed step: Bring two IDs”",
    });
    await waitFor(() => expect(isDisabled(undo)).toBe(false));
    fireEvent.click(undo);
    expect(
      await within(panel).findByRole("checkbox", { name: "Bring two IDs" }),
    ).toBeTruthy();
    expect(
      server.sent.filter((b) => b.action === "undo")[0].receipt_operation_id,
    ).toBe(removal.operation_id);

    await toggle(panel, "Bring two IDs", true);
    await toggle(panel, "Choose a bank", true);
    const complete = await within(panel).findByRole("button", {
      name: "Mark task complete",
    });
    await waitFor(() => expect(isDisabled(complete)).toBe(false));
    fireEvent.click(complete);
    await waitFor(() =>
      expect(
        within(panel)
          .getByRole("radio", { name: "Completed" })
          .getAttribute("aria-checked"),
      ).toBe("true"),
    );

    // Reopen the task, type a step, close and open again: the typed text is kept.
    const notStarted = within(panel).getByRole("radio", {
      name: "Not started",
    });
    await waitFor(() => expect(isDisabled(notStarted)).toBe(false));
    fireEvent.click(notStarted);
    fireEvent.change(
      await within(panel).findByRole("textbox", { name: "New step" }),
      {
        target: { value: "Ask about fees" },
      },
    );
    fireEvent.keyDown(panel, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const again = await openSteps();
    expect((again.input as HTMLInputElement).value).toBe("Ask about fees");
  });

  it("a lost step reply is looked up, never resent; pending and failed lookups stay unresolved; not applied retries the same operation", async () => {
    // Wrong if: a second write is sent while the outcome is unknown, or Retry uses a new id.
    let lookup: "commit" | "pending" | "fail" | "not_applied" = "commit";
    override = (body) => {
      const type = (body.operations as Array<{ type: string }> | undefined)?.[0]
        ?.type;
      if (
        body.action === "apply" &&
        type === "step.create" &&
        lookup === "commit"
      ) {
        server.handle(body);
        return "network-error";
      }
      if (
        body.action === "apply" &&
        type === "step.set_done" &&
        lookup !== "not_applied"
      )
        return "network-error";
      if (body.action === "status" && lookup === "pending")
        return { status: 200, body: { status: "pending" } };
      if (body.action === "status" && lookup === "fail")
        return { status: 500, body: { error: "internal" } };
      return undefined;
    };
    mount(<ChecklistPage />);
    const { panel } = await openSteps();
    await addStep(panel, "Book an appointment");
    expect(
      await within(panel).findByText("Added step: Book an appointment"),
    ).toBeTruthy();
    expect(
      within(panel).getAllByRole("checkbox", { name: "Book an appointment" }),
    ).toHaveLength(1);
    expect(stepApplies()).toHaveLength(1);

    lookup = "pending";
    const box = within(panel).getByRole("checkbox", {
      name: "Book an appointment",
    });
    await waitFor(() => expect(isDisabled(box)).toBe(false));
    fireEvent.click(box);
    expect(
      await within(panel).findByText(
        "The change is still being saved. Check again in a moment.",
      ),
    ).toBeTruthy();
    expect(
      isDisabled(
        within(panel).getByRole("checkbox", { name: "Book an appointment" }),
      ),
    ).toBe(true);
    lookup = "fail";
    fireEvent.click(within(panel).getByRole("button", { name: "Check again" }));
    expect(
      await within(panel).findByText(
        "We could not check the result. The change may or may not have saved.",
      ),
    ).toBeTruthy();
    expect(
      stepApplies().filter((w) => w.operations[0].type === "step.set_done"),
    ).toHaveLength(1);
    lookup = "not_applied";
    fireEvent.click(within(panel).getByRole("button", { name: "Check again" }));
    fireEvent.click(
      await within(panel).findByRole("button", { name: "Try again" }),
    );
    await waitFor(() =>
      expect(
        checked(
          within(panel).getByRole("checkbox", { name: "Book an appointment" }),
        ),
      ).toBe(true),
    );
    const tries = stepApplies().filter(
      (w) => w.operations[0].type === "step.set_done",
    );
    expect(tries).toHaveLength(2);
    expect(tries[1].operation_id).toBe(tries[0].operation_id);
  });

  it("offline blocks every step write and keeps the typed step; an account change drops the steps and typed step", async () => {
    // Wrong if: a write is sent offline, the typed text is lost, or the next account sees them.
    mount(<ChecklistPage />);
    const { panel } = await openSteps();
    await addStep(panel, "A private step");
    fireEvent.change(within(panel).getByRole("textbox", { name: "New step" }), {
      target: { value: "A private draft" },
    });
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => false,
    });
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    await waitFor(() =>
      expect(
        isDisabled(within(panel).getByRole("button", { name: "Add step" })),
      ).toBe(true),
    );
    expect(
      isDisabled(
        within(panel).getByRole("checkbox", { name: "A private step" }),
      ),
    ).toBe(true);
    const before = server.writes().length;
    fireEvent.click(within(panel).getByRole("button", { name: "Add step" }));
    fireEvent.click(
      within(panel).getByRole("checkbox", { name: "A private step" }),
    );
    expect(server.writes()).toHaveLength(before);
    expect(
      (
        within(panel).getByRole("textbox", {
          name: "New step",
        }) as HTMLInputElement
      ).value,
    ).toBe("A private draft");

    act(() => account.set("web-user-other"));
    await waitFor(() =>
      expect(
        screen.queryByRole("checkbox", { name: "A private step" }),
      ).toBeNull(),
    );
    expect(screen.queryByDisplayValue("A private draft")).toBeNull();
  });

  it("suggested steps are a draft card; excluding one is a new revision; approval adds the selected steps once; Not now writes nothing", async () => {
    // Wrong if: a step is saved before approval, the approval names an older revision,
    // a double click adds twice, the typed message is lost, or Not now writes.
    generateReply.mockResolvedValueOnce(
      stepReply("Start with the official requirements.", SIN_STEPS),
    );
    mount(<CompanionPage />);
    await send("How do I get my SIN?");
    const card = await screen.findByTestId("step-draft-card");
    expect(await within(card).findByText("Steps for Get a SIN")).toBeTruthy();
    expect(within(card).getByText("Draft · not saved yet")).toBeTruthy();
    expect(server.steps()).toEqual([]);
    fireEvent.change(screen.getByRole("textbox", { name: /message/i }), {
      target: { value: "My next question" },
    });

    fireEvent.click(
      await within(card).findByRole("button", {
        name: "Review suggested steps for Get a SIN",
      }),
    );
    const panel = await dialog();
    expect(
      within(panel).getByRole("heading", { name: "Review suggested steps" }),
    ).toBeTruthy();
    for (const title of SIN_STEPS)
      expect(
        checked(await within(panel).findByRole("checkbox", { name: title })),
      ).toBe(true);
    const third = within(panel).getByRole("checkbox", { name: SIN_STEPS[2] });
    await waitFor(() => expect(isDisabled(third)).toBe(false));
    fireEvent.click(third);
    const approve = await within(panel).findByRole("button", {
      name: "Add selected steps (2)",
    });
    await waitFor(() => expect(isDisabled(approve)).toBe(false));
    expect(
      server.sent.filter((b) => b.action === "revise")[0].operation.titles,
    ).toEqual(SIN_STEPS.slice(0, 2));
    fireEvent.click(approve);
    fireEvent.click(approve);
    expect(
      await within(panel).findByText("Steps added to this task: 2"),
    ).toBeTruthy();
    expect(stepApplies()).toHaveLength(1);
    expect(stepApplies()[0].authorization).toEqual({
      kind: "approved_proposal",
      proposal_id: server.stepDrafts()[0].proposal_id,
      proposal_revision: 2,
    });
    expect(server.steps().map((s) => s.title)).toEqual(SIN_STEPS.slice(0, 2));
    fireEvent.keyDown(panel, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
      (screen.getByRole("textbox", { name: /message/i }) as HTMLTextAreaElement)
        .value,
    ).toBe("My next question");

    generateReply.mockResolvedValueOnce(
      stepReply("Another.", ["Keep a copy of your SIN letter"]),
    );
    await send("Anything else?");
    await waitFor(() =>
      expect(screen.getAllByTestId("step-draft-card")).toHaveLength(2),
    );
    const second = screen.getAllByTestId("step-draft-card")[1];
    fireEvent.click(
      await within(second).findByRole("button", {
        name: "Review suggested steps for Get a SIN",
      }),
    );
    const panel2 = await dialog();
    const notNow = await within(panel2).findByRole("button", {
      name: "Not now",
    });
    await waitFor(() => expect(isDisabled(notNow)).toBe(false));
    fireEvent.click(notNow);
    expect(await within(panel2).findByText("Not added.")).toBeTruthy();
    expect(stepApplies()).toHaveLength(1);
  });

  it("step results reach analytics as allowlisted categories only, never the step text", async () => {
    // Wrong if: any captured property holds the step title or an id.
    mount(<ChecklistPage />);
    const { panel } = await openSteps();
    await addStep(panel, "Secret step title");
    await waitFor(() =>
      expect(
        capture.mock.calls.filter((c) => c[0] === "companion_action_result")
          .length,
      ).toBeGreaterThan(0),
    );
    const events = capture.mock.calls.filter(
      (c) => c[0] === "companion_action_result",
    );
    expect(events[0][1]).toEqual(
      expect.objectContaining({
        operation_type: "step.create",
        action: "step_change",
        outcome: "applied",
      }),
    );
    expect(JSON.stringify(capture.mock.calls)).not.toMatch(
      /Secret step title|0000-4000-8000/,
    );
  });
  it.each(["rename", "add"] as const)(
    "%s: a changed draft needs a new authorized intent after not_applied",
    async (kind) => {
      const type = kind === "rename" ? "step.update" : "step.create";
      let drop = true;
      override = (body) =>
        body.action === "apply" && body.operations?.[0]?.type === type && drop
          ? "network-error"
          : undefined;
      mount(<ChecklistPage />);
      const { panel } = await openSteps();
      if (kind === "rename") {
        await addStep(panel, "Original title");
        const edit = within(panel).getByRole("button", {
          name: "Edit step: Original title",
        });
        await waitFor(() => expect(isDisabled(edit)).toBe(false));
        fireEvent.click(edit);
      }
      const field = within(panel).getByRole("textbox", {
        name: kind === "rename" ? "Step text" : "New step",
      });
      const save = () =>
        within(panel).getByRole("button", {
          name: kind === "rename" ? "Save step" : "Add step",
        });
      fireEvent.change(field, { target: { value: "First authorized title" } });
      fireEvent.click(save());
      const retry = await within(panel).findByRole("button", {
        name: "Try again",
      });
      expect(
        stepApplies().filter((w) => w.operations[0].type === type),
      ).toHaveLength(1);
      fireEvent.change(field, { target: { value: "New visible draft" } });
      expect(isDisabled(retry)).toBe(true);
      fireEvent.click(retry);
      expect(
        stepApplies().filter((w) => w.operations[0].type === type),
      ).toHaveLength(1);
      drop = false;
      await waitFor(() => expect(isDisabled(save())).toBe(false));
      fireEvent.click(save());
      expect(
        await within(panel).findByRole("checkbox", {
          name: "New visible draft",
        }),
      ).toBeTruthy();
      expect(
        within(panel).queryByRole("checkbox", {
          name: "First authorized title",
        }),
      ).toBeNull();
      const writes = stepApplies().filter((w) => w.operations[0].type === type);
      expect(writes).toHaveLength(2);
      expect(writes[1].operation_id).not.toBe(writes[0].operation_id);
    },
  );

  it.each(["rename", "add"] as const)(
    "%s: an unchanged or restored draft retries the exact original operation",
    async (kind) => {
      const type = kind === "rename" ? "step.update" : "step.create";
      let drop = true;
      override = (body) =>
        body.action === "apply" && body.operations?.[0]?.type === type && drop
          ? "network-error"
          : undefined;
      mount(<ChecklistPage />);
      const { panel } = await openSteps();
      if (kind === "rename") {
        await addStep(panel, "Original title");
        const edit = within(panel).getByRole("button", {
          name: "Edit step: Original title",
        });
        await waitFor(() => expect(isDisabled(edit)).toBe(false));
        fireEvent.click(edit);
      }
      const field = within(panel).getByRole("textbox", {
        name: kind === "rename" ? "Step text" : "New step",
      });
      fireEvent.change(field, { target: { value: "First authorized title" } });
      fireEvent.click(
        within(panel).getByRole("button", {
          name: kind === "rename" ? "Save step" : "Add step",
        }),
      );
      const retry = await within(panel).findByRole("button", {
        name: "Try again",
      });
      fireEvent.change(field, { target: { value: "Unsaved alternate" } });
      fireEvent.change(field, { target: { value: "First authorized title" } });
      expect(isDisabled(retry)).toBe(false);
      drop = false;
      fireEvent.click(retry);
      expect(
        await within(panel).findByRole("checkbox", {
          name: "First authorized title",
        }),
      ).toBeTruthy();
      const writes = stepApplies().filter((w) => w.operations[0].type === type);
      expect(writes).toHaveLength(2);
      expect(writes[1].operation_id).toBe(writes[0].operation_id);
      expect(writes[1].operations).toEqual(writes[0].operations);
    },
  );

  it.each(["rename", "add"] as const)(
    "%s: editing cannot replace an unknown write before confirmed non-application",
    async (kind) => {
      const type = kind === "rename" ? "step.update" : "step.create";
      let pending = true;
      override = (body) => {
        if (body.action === "apply" && body.operations?.[0]?.type === type)
          return "network-error";
        if (body.action === "status" && pending)
          return { status: 200, body: { status: "pending" } };
        return undefined;
      };
      mount(<ChecklistPage />);
      const { panel } = await openSteps();
      if (kind === "rename") {
        await addStep(panel, "Original title");
        const edit = within(panel).getByRole("button", {
          name: "Edit step: Original title",
        });
        await waitFor(() => expect(isDisabled(edit)).toBe(false));
        fireEvent.click(edit);
      }
      const field = within(panel).getByRole("textbox", {
        name: kind === "rename" ? "Step text" : "New step",
      });
      const save = () =>
        within(panel).getByRole("button", {
          name: kind === "rename" ? "Save step" : "Add step",
        });
      fireEvent.change(field, { target: { value: "First authorized title" } });
      fireEvent.click(save());
      const lookup = await within(panel).findByRole("button", {
        name: "Check again",
      });
      fireEvent.change(field, { target: { value: "New visible draft" } });
      expect(isDisabled(save())).toBe(true);
      expect(
        within(panel).queryByRole("button", { name: "Try again" }),
      ).toBeNull();
      fireEvent.click(save());
      expect(
        stepApplies().filter((w) => w.operations[0].type === type),
      ).toHaveLength(1);
      pending = false;
      fireEvent.click(lookup);
      expect(
        isDisabled(
          await within(panel).findByRole("button", { name: "Try again" }),
        ),
      ).toBe(true);
      expect(isDisabled(save())).toBe(false);
      expect((field as HTMLInputElement).value).toBe("New visible draft");
    },
  );

  it.each(["edit", "remove"] as const)(
    "%s disclosure animates for pointer activation and opens immediately from the keyboard",
    async (kind) => {
      mount(<ChecklistPage />);
      const { panel } = await openSteps();
      await addStep(panel, "Disclosure step");
      const trigger = () =>
        within(panel).getByRole("button", {
          name: `${kind === "edit" ? "Edit" : "Remove"} step: Disclosure step`,
        });
      await waitFor(() => expect(isDisabled(trigger())).toBe(false));
      fireEvent.click(trigger(), { detail: 1 });
      const disclosure = () =>
        (kind === "edit"
          ? within(panel)
              .getByRole("textbox", { name: "Step text" })
              .closest(".pb-2")
          : within(panel)
              .getByRole("button", { name: "Remove step" })
              .closest(".mb-2")) as HTMLElement;
      expect(disclosure().style.opacity).toBe("0");
      fireEvent.click(
        within(panel).getByRole("button", {
          name: kind === "edit" ? "Cancel" : "Keep step",
        }),
      );
      fireEvent.click(trigger(), { detail: 0 });
      expect(disclosure().style.opacity).not.toBe("0");
      expect(disclosure().style.transform).not.toContain("-4");
    },
  );
});

it.each(["normal", "lost_reply", "not_applied"] as const)("an approved suggestion offers receipt-specific Undo (%s), confirms removal and keeps a later unrelated step", async requestCase => {
  // Wrong if Undo is absent, writes before confirmation, or removes another action's step.
  let retryAllowed = false;
  let lookup: "pending" | "failed" | "not_applied" = "pending";
  override = body => {
    if (body.action === "undo" && requestCase === "lost_reply") {
      server.handle(body);
      return "network-error";
    }
    if (body.action === "undo" && requestCase === "not_applied" && !retryAllowed) return "network-error";
    if (body.action === "status" && requestCase === "not_applied") {
      if (lookup === "failed") return { status: 500, body: { error: "internal" } };
      return { status: 200, body: { status: lookup } };
    }
    return undefined;
  };
  generateReply.mockResolvedValueOnce(stepReply("Preparation steps.", ["Bring two IDs", "Choose a bank"]));
  mount(<CompanionPage />);
  await send("How do I prepare for my SIN?");
  const card = await screen.findByTestId("step-draft-card");
  fireEvent.click(await within(card).findByRole("button", { name: "Review suggested steps for Get a SIN" }));
  const panel = await dialog();
  const approve = await within(panel).findByRole("button", { name: "Add selected steps (2)" });
  await waitFor(() => expect(isDisabled(approve)).toBe(false));
  fireEvent.click(approve);
  await within(panel).findByText("Steps added to this task: 2");
  const added = stepApplies()[0];
  expect(server.handle({
    action: "apply", operation_id: crypto.randomUUID(), authorization: { kind: "ui_control" },
    operations: [{ type: "step.create", task_ref: "sanity:sin", titles: ["Call a translator"] }],
  }).status).toBe(200);
  const undo = await within(panel).findByRole("button", { name: "Undo “Steps added: 2”" });
  await waitFor(() => expect(isDisabled(undo)).toBe(false));
  fireEvent.click(undo);
  await within(panel).findByText("Remove these 2 steps?");
  expect(server.sent.filter(b => b.action === "undo")).toHaveLength(0);
  fireEvent.click(within(panel).getByRole("button", { name: "Keep step" }));
  expect(server.steps()).toHaveLength(3);
  expect(server.sent.filter(b => b.action === "undo")).toHaveLength(0);
  fireEvent.click(within(panel).getByRole("button", { name: "Undo “Steps added: 2”" }));
  const remove = await within(panel).findByRole("button", { name: "Remove step" });
  await waitFor(() => expect(isDisabled(remove)).toBe(false));
  fireEvent.click(remove);
  if (requestCase === "not_applied") {
    await within(panel).findByText("The change is still being saved. Check again in a moment.");
    expect(server.sent.filter(b => b.action === "undo")).toHaveLength(1);
    lookup = "failed";
    fireEvent.click(within(panel).getByRole("button", { name: "Check again" }));
    await within(panel).findByText("We could not check the result. The change may or may not have saved.");
    expect(server.steps().filter(s => !s.removed)).toHaveLength(3);
    lookup = "not_applied";
    fireEvent.click(within(panel).getByRole("button", { name: "Check again" }));
    const retry = await within(panel).findByRole("button", { name: "Try again" });
    await waitFor(() => expect(isDisabled(retry)).toBe(false));
    retryAllowed = true;
    fireEvent.click(retry);
  }
  await within(panel).findByText("Steps removed: 2");
  expect(within(panel).queryByText("Steps added to this task: 2")).toBeNull();
  expect(server.steps().filter(s => !s.removed).map(s => s.title)).toEqual(["Call a translator"]);
  const undos = server.sent.filter(b => b.action === "undo");
  expect(undos).toHaveLength(requestCase === "not_applied" ? 2 : 1);
  expect(undos.at(-1)?.operation_id).toBe(undos[0].operation_id);
  expect(undos[0].receipt_operation_id).toBe(added.operation_id);
  expect(undos[0].authorization).toEqual({ kind: "ui_control", removal_confirmed: true });
});

it.each(["approve", "keep"] as const)(
  "a conflicting rename Undo shows its exact proposed text before %s",
  async (choice) => {
    // Wrong if approval can restore an undisclosed title, or Keep sends a write.
    expect(server.handle({
      action: "apply", operation_id: crypto.randomUUID(),
      authorization: { kind: "ui_control" },
      operations: [{ type: "step.create", task_ref: "sanity:sin", titles: ["Gather the original papers"] }],
    }).status).toBe(200);
    mount(<ChecklistPage />);
    const { panel } = await openSteps();
    const edit = within(panel).getByRole("button", { name: "Edit step: Gather the original papers" });
    await waitFor(() => expect(isDisabled(edit)).toBe(false));
    fireEvent.click(edit);
    fireEvent.change(within(panel).getByRole("textbox", { name: "Step text" }), { target: { value: "Call the service centre" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Save step" }));
    const undo = await within(panel).findByRole("button", { name: "Undo “Renamed step “Gather the original papers” to “Call the service centre””" });
    await waitFor(() => expect(isDisabled(undo)).toBe(false));
    const step = server.steps()[0];
    expect(server.handle({
      action: "apply", operation_id: crypto.randomUUID(),
      authorization: { kind: "ui_control" },
      operations: [{ type: "step.update", step_id: step.step_id, title: "Keep the newer instructions", expected_revision: step.revision }],
    }).status).toBe(200);
    fireEvent.click(undo);
    const approve = await within(panel).findByRole("button", { name: "Apply this change" });
    await waitFor(() => expect(isDisabled(approve)).toBe(false));
    expect(within(panel).getByRole("checkbox", { name: "Keep the newer instructions" })).toBeTruthy();
    expect(within(panel).getByText("Proposed step text: Gather the original papers")).toBeTruthy();
    const writesBefore = stepApplies().length;
    if (choice === "keep") {
      fireEvent.click(within(panel).getByRole("button", { name: "Keep current" }));
      expect(stepApplies()).toHaveLength(writesBefore);
      expect(server.steps()[0].title).toBe("Keep the newer instructions");
    } else {
      fireEvent.click(approve);
      await within(panel).findByRole("checkbox", { name: "Gather the original papers" });
      expect(stepApplies()).toHaveLength(writesBefore + 1);
      expect(stepApplies().at(-1)?.operations[0].title).toBe("Gather the original papers");
    }
  },
);

it.each(["keep", "approve"] as const)("a reopened suggested-step receipt shows its current removal target before %s", async choice => {
  // Wrong if the old receipt stays current, or Undo overwrites the newer step without review.
  generateReply.mockResolvedValueOnce(stepReply("Preparation steps.", ["Bring two IDs"]));
  mount(<CompanionPage />);
  await send("How do I prepare for my SIN?");
  const card = await screen.findByTestId("step-draft-card");
  fireEvent.click(await within(card).findByRole("button", { name: "Review suggested steps for Get a SIN" }));
  let panel = await dialog();
  const approve = await within(panel).findByRole("button", { name: "Add selected steps (1)" });
  await waitFor(() => expect(isDisabled(approve)).toBe(false));
  fireEvent.click(approve);
  await within(panel).findByRole("button", { name: "Undo “Added step: Bring two IDs”" });
  const step = server.steps()[0];
  expect(server.handle({ action: "apply", operation_id: crypto.randomUUID(), authorization: { kind: "ui_control" },
    operations: [{ type: "step.update", step_id: step.step_id, title: "Check the newer ID requirements", expected_revision: step.revision }] }).status).toBe(200);
  fireEvent.click(within(panel).getByRole("button", { name: "Close" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  fireEvent.click(await within(screen.getByTestId("step-draft-card")).findByRole("button", { name: "View" }));
  panel = await dialog();
  await within(panel).findByText(/This task changed after this/);
  const undo = within(panel).getByRole("button", { name: "Undo “Added step: Bring two IDs”" });
  await waitFor(() => expect(isDisabled(undo)).toBe(false));
  fireEvent.click(undo);
  const remove = await within(panel).findByRole("button", { name: "Remove step" });
  await waitFor(() => expect(isDisabled(remove)).toBe(false));
  fireEvent.click(remove);
  await within(panel).findByText("This step changed after it was added. Nothing was removed. Remove it now?");
  const compensate = await within(panel).findByRole("button", { name: "Remove step" });
  await waitFor(() => expect(isDisabled(compensate)).toBe(false));
  expect(within(panel).getByText("Check the newer ID requirements")).toBeTruthy();
  expect(server.steps().filter(s => !s.removed).map(s => s.title)).toEqual(["Check the newer ID requirements"]);
  const writes = stepApplies().length;
  if (choice === "keep") {
    fireEvent.click(within(panel).getByRole("button", { name: "Keep current" }));
    expect(stepApplies()).toHaveLength(writes);
    expect(server.steps().filter(s => !s.removed).map(s => s.title)).toEqual(["Check the newer ID requirements"]);
  } else {
    fireEvent.click(compensate);
    await within(panel).findByText("Removed step: Check the newer ID requirements");
    expect(server.steps().filter(s => !s.removed)).toHaveLength(0);
    const approved = stepApplies().at(-1);
    expect(approved?.operations).toEqual([{ type: "step.remove_created", task_ref: "sanity:sin", steps: [{ step_id: step.step_id, expected_revision: 2 }] }]);
    expect(approved?.authorization.kind).toBe("approved_proposal");
    expect(approved?.authorization.removal_confirmed).toBe(true);
  }
});

it.each([1, 0] as const)("suggested-step Undo confirmation uses shared reveal for click detail %s", async detail => {
  // Wrong if pointer activation is instant, or keyboard activation is hidden.
  generateReply.mockResolvedValueOnce(stepReply("Preparation steps.", ["Bring two IDs"]));
  mount(<CompanionPage />);
  await send("How do I prepare for my SIN?");
  const card = await screen.findByTestId("step-draft-card");
  fireEvent.click(await within(card).findByRole("button", { name: "Review suggested steps for Get a SIN" }));
  const panel = await dialog();
  const approve = await within(panel).findByRole("button", { name: "Add selected steps (1)" });
  await waitFor(() => expect(isDisabled(approve)).toBe(false));
  fireEvent.click(approve);
  const undo = await within(panel).findByRole("button", { name: "Undo “Added step: Bring two IDs”" });
  await waitFor(() => expect(isDisabled(undo)).toBe(false));
  fireEvent.click(undo, { detail });
  // Read the initial style before yielding to the first animation frame.
  const text = within(panel).getByText("Remove “Bring two IDs”?");
  const disclosure = text.closest(".mt-2") as HTMLElement;
  if (detail === 1) expect(disclosure.parentElement?.style.opacity).toBe("0");
  else expect(disclosure.parentElement?.style.opacity).not.toBe("0");
});

it.each(["ready", "stale", "missing"] as const)("bulk removal verifies every current target (%s) before approval", async readCase => {
  // Wrong if one verified target permits removal of another unverified target.
  let mode: "ready" | "stale" | "missing" = "ready";
  let initialRows: unknown[] = [];
  let secondId = "";
  override = body => {
    if (body.action !== "read" || mode === "ready") return undefined;
    const result = server.handle(body);
    const reply = result.body;
    if (!reply || typeof reply !== "object" || !("steps" in reply) || !Array.isArray(reply.steps)) {
      throw new Error("The read fixture must return steps.");
    }
    return { ...result, body: { ...reply, steps: mode === "stale"
      ? initialRows : reply.steps.filter((row: { step_id: string }) => row.step_id !== secondId) } };
  };
  generateReply.mockResolvedValueOnce(stepReply("Preparation steps.", ["First original step", "Second original step"]));
  mount(<CompanionPage />);
  await send("Help me prepare.");
  fireEvent.click(await within(await screen.findByTestId("step-draft-card")).findByRole("button", { name: "Review suggested steps for Get a SIN" }));
  let panel = await dialog();
  const approve = await within(panel).findByRole("button", { name: "Add selected steps (2)" });
  await waitFor(() => expect(isDisabled(approve)).toBe(false));
  fireEvent.click(approve);
  await within(panel).findByRole("button", { name: "Undo “Steps added: 2”" });
  const initial = server.handle({ action: "read" }).body;
  if (!initial || typeof initial !== "object" || !("steps" in initial) || !Array.isArray(initial.steps)) {
    throw new Error("The read fixture must return steps.");
  }
  initialRows = initial.steps;
  const originals = server.steps();
  secondId = originals[1].step_id;
  for (const [index, step] of originals.entries()) {
    expect(server.handle({ action: "apply", operation_id: crypto.randomUUID(), authorization: { kind: "ui_control" },
      operations: [{ type: "step.update", step_id: step.step_id, title: index === 0 ? "Current first step" : "Current second step", expected_revision: step.revision }] }).status).toBe(200);
  }
  expect(server.handle({ action: "apply", operation_id: crypto.randomUUID(), authorization: { kind: "ui_control" },
    operations: [{ type: "step.create", task_ref: "sanity:sin", titles: ["Unrelated step"] }] }).status).toBe(200);
  fireEvent.click(within(panel).getByRole("button", { name: "Close" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  fireEvent.click(await within(screen.getByTestId("step-draft-card")).findByRole("button", { name: "View" }));
  panel = await dialog();
  const undo = await within(panel).findByRole("button", { name: "Undo “Steps added: 2”" });
  await waitFor(() => expect(isDisabled(undo)).toBe(false));
  fireEvent.click(undo);
  mode = readCase;
  fireEvent.click(await within(panel).findByRole("button", { name: "Remove step" }));
  await within(panel).findByRole("button", { name: "Keep current" });
  if (readCase !== "ready") {
    await within(panel).findByText("We cannot verify these step details. Choose “Keep current”, then select “Undo” again.");
    const blocked = within(panel).getByRole("button", { name: "Remove step" });
    expect(isDisabled(blocked)).toBe(true);
    const before = stepApplies().length;
    fireEvent.click(blocked);
    expect(stepApplies()).toHaveLength(before);
    mode = "ready";
    fireEvent.click(within(panel).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(await within(screen.getByTestId("step-draft-card")).findByRole("button", { name: "View" }));
    panel = await dialog();
  }
  const remove = await within(panel).findByRole("button", { name: "Remove step" });
  await waitFor(() => expect(isDisabled(remove)).toBe(false));
  expect(within(panel).getByText("Current first step")).toBeTruthy();
  expect(within(panel).getByText("Current second step")).toBeTruthy();
  fireEvent.click(remove);
  await within(panel).findByText("Steps removed: 2");
  expect(server.steps().filter(s => !s.removed).map(s => s.title)).toEqual(["Unrelated step"]);
  expect(stepApplies().at(-1)?.operations[0].steps).toEqual(originals.map(step => ({ step_id: step.step_id, expected_revision: 2 })));
});

it("a direct step receipt keeps its original text and becomes historical after a newer edit", async () => {
  const mounted = mount(<ChecklistPage />);
  const { panel } = await openSteps();
  await addStep(panel, "Original direct step");
  // Wrong if a fresh step read leaves its previous receipt labelled current.
  const undoName = "Undo “Added step: Original direct step”";
  await waitFor(() =>
    expect(
      isDisabled(within(panel).getByRole("button", { name: undoName })),
    ).toBe(false),
  );
  expect(within(panel).queryByText(/This task changed after this/)).toBeNull();
  const step = server.steps()[0];
  expect(
    server.handle({
      action: "apply",
      operation_id: crypto.randomUUID(),
      authorization: { kind: "ui_control" },
      operations: [
        {
          type: "step.update",
          step_id: step.step_id,
          title: "Current direct step",
          expected_revision: step.revision,
        },
      ],
    }).status,
  ).toBe(200);
  await act(async () => {
    await mounted.queryClient.refetchQueries({
      queryKey: ["companion-task-actions"],
    });
  });
  await within(panel).findByRole("checkbox", { name: "Current direct step" });
  expect(
    within(panel).getByText("Added step: Original direct step"),
  ).toBeTruthy();
  expect(within(panel).getByText(/This task changed after this/)).toBeTruthy();
});

it("a checked-step receipt stays historical when a later client restores the same checkbox value", async () => {
  // Wrong if matching text and checkbox values hide later revisions.
  const mounted = mount(<ChecklistPage />);
  const { panel } = await openSteps();
  await addStep(panel, "Prepare the papers");
  const box = await within(panel).findByRole("checkbox", {
    name: "Prepare the papers",
  });
  await waitFor(() => expect(isDisabled(box)).toBe(false));
  fireEvent.click(box);
  await within(panel).findByText("Checked step: Prepare the papers");
  await waitFor(() =>
    expect(
      within(panel).getAllByText(/This task changed after this/),
    ).toHaveLength(1),
  );
  const step = server.steps()[0];
  for (const [index, done] of [false, true].entries()) {
    expect(
      server.handle({
        action: "apply",
        operation_id: crypto.randomUUID(),
        authorization: { kind: "ui_control" },
        operations: [
          {
            type: "step.set_done",
            step_id: step.step_id,
            done,
            expected_revision: step.revision + index,
          },
        ],
      }).status,
    ).toBe(200);
  }
  await act(async () => {
    await mounted.queryClient.refetchQueries({
      queryKey: ["companion-task-actions"],
    });
  });
  expect(checked(
    within(panel).getByRole("checkbox", { name: "Prepare the papers" }),
  )).toBe(true);
  expect(
    within(panel).getByText("Checked step: Prepare the papers"),
  ).toBeTruthy();
  await waitFor(() => expect(
    within(panel).getAllByText(/This task changed after this/),
  ).toHaveLength(2));
});

it("an unrelated added step does not make the direct receipt historical", async () => {
  // Wrong if another step's revision changes the recorded result of this one.
  const mounted = mount(<ChecklistPage />);
  const { panel } = await openSteps();
  await addStep(panel, "Prepare the papers");
  await within(panel).findByText("Added step: Prepare the papers");
  expect(
    server.handle({
      action: "apply",
      operation_id: crypto.randomUUID(),
      authorization: { kind: "ui_control" },
      operations: [
        {
          type: "step.create",
          task_ref: "sanity:sin",
          titles: ["Ask about service hours"],
        },
      ],
    }).status,
  ).toBe(200);
  await act(async () => {
    await mounted.queryClient.refetchQueries({
      queryKey: ["companion-task-actions"],
    });
  });
  await within(panel).findByRole("checkbox", {
    name: "Ask about service hours",
  });
  expect(
    within(panel).getByText("Added step: Prepare the papers"),
  ).toBeTruthy();
  expect(within(panel).queryByText(/This task changed after this/)).toBeNull();
});
