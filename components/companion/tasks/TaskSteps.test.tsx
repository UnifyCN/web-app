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
