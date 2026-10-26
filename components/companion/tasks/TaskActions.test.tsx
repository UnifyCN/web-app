// @vitest-environment jsdom
//
// Mounted acceptance for task progress on web (mobile-app#361): the real
// Checklist and Companion pages, the real drawer and controls, the real client,
// store and query cache. The network is the scripted contract stand-in in
// taskActionsTestHarness.tsx; the endpoint and database are proven by
// supabase/tests/companion-actions (run.sh).
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
import { onlineManager } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PROPOSAL_ID,
  Providers,
  newQueryClient,
  scriptedServer,
} from "./taskActionsTestHarness";

// ---------------------------------------------------------------- stand-ins
const account = {
  id: "web-user-1",
  listeners: new Set<() => void>(),
  set(id: string | null) {
    this.id = id as string;
    for (const l of this.listeners) l();
  },
};
vi.mock("@/hooks/useAuthUser", () => ({
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
// Checklist rows per account. The default account sees one content-backed task;
// a test can give an account its own private rows.
const sinTask = () => ({
  id: "sin",
  priority: "Do now",
  title: "Get a SIN",
  description: "",
  completed: legacyCompleted.has("sin"),
  completedAt: null,
  dismissedAt: null,
  isCustom: false,
});
const tasksByAccount = new Map<string, unknown[]>();
const legacyCompleted = new Set<string>();
vi.mock("@/services/checklist", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/checklist")>();
  return {
    ...actual,
    getTasks: vi.fn(async () => tasksByAccount.get(account.id) ?? [sinTask()]),
    // The legacy Checklist completion path. The database maps it onto the
    // shared task state (proven by the local-stack suites); here the scripted
    // service records the same change.
    toggleTask: vi.fn(async (input: { id: string; completed: boolean }) => {
      if (input.completed) legacyCompleted.delete(input.id);
      else legacyCompleted.add(input.id);
      server.editElsewhere(
        `sanity:${input.id}`,
        input.completed ? "not_started" : "completed",
      );
    }),
  };
});
// Conversation, generation and allowance hooks are not under test here.
let messageCount = 0;
const generate = vi.fn();
vi.mock("@/hooks/useCompanion", () => {
  const idle = { data: undefined, isLoading: false, isPending: false };
  return {
    messagesKey: (id: string) => ["companion-messages", id],
    useConversations: () => ({ ...idle, data: [] }),
    useConversationMessages: () => ({ ...idle, data: [] }),
    useChatbotUsage: () => ({
      ...idle,
      data: { message_count: messageCount, is_premium: false },
    }),
    useCreateConversation: () => ({ mutateAsync: generate, isPending: false }),
    useSendMessage: () => ({ mutateAsync: generate, isPending: false }),
    useDeleteConversation: () => ({ mutate: vi.fn(), isPending: false }),
  };
});
vi.mock("@/hooks/useProfile", () => ({
  useCurrentUser: () => ({ data: { id: account.id, onboarding: null } }),
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

const dialog = () => screen.findByRole("dialog");
const radio = (scope: HTMLElement, name: string) =>
  within(scope).getByRole("radio", { name });
const isDisabled = (el: HTMLElement) =>
  el.getAttribute("aria-disabled") === "true";

async function openFromChecklist() {
  mount(<ChecklistPage />);
  const opener = await screen.findByRole("button", {
    name: "Task progress for Get a SIN",
  });
  // Keyboard activation: the control has focus when it opens the drawer.
  opener.focus();
  fireEvent.click(opener);
  const panel = await dialog();
  await waitFor(() =>
    expect(radio(panel, "Not started").getAttribute("aria-checked")).toBe(
      "true",
    ),
  );
  await waitFor(() => expect(isDisabled(radio(panel, "Waiting"))).toBe(false));
  return { opener, panel };
}

function setOnline(online: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    get: () => online,
  });
  window.dispatchEvent(new Event(online ? "online" : "offline"));
}

let accountCounter = 0;
beforeEach(() => {
  account.id = `web-user-${++accountCounter}`;
  tasksByAccount.clear();
  legacyCompleted.clear();
  // A test that ends offline leaves React Query's global online state behind.
  onlineManager.setOnline(true);
  capture.mockReset();
  generate.mockReset();
  messageCount = 0;
  setOnline(true);
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  useServer(scriptedServer());
});
afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
});

// ---------------------------------------------------------------- tests
describe("Checklist task progress (web)", () => {
  it("saves Waiting with a reason from explicit controls, shows the exact receipt, restores focus, and the row shows it", async () => {
    const { opener, panel } = await openFromChecklist();

    fireEvent.click(radio(panel, "Waiting"));
    expect(
      await within(panel).findByText("Changed from Not started to Waiting"),
    ).toBeTruthy();
    const first = server.writes()[0];
    expect(first.client).toEqual({ platform: "web", app_version: "web" });
    expect(first.authorization).toEqual({ kind: "ui_control" });
    expect(first.operations).toEqual([
      {
        type: "task.set_state",
        task_ref: "sanity:sin",
        state: "waiting",
        expected_revision: 0,
      },
    ]);

    const reason = within(panel).getByLabelText("What are you waiting for?");
    fireEvent.change(reason, {
      target: { value: "A letter from Service Canada" },
    });
    const save = within(panel).getByRole("button", {
      name: "Save waiting reason",
    });
    await waitFor(() => expect(isDisabled(save)).toBe(false));
    fireEvent.click(save);
    await waitFor(() => expect(server.writes()).toHaveLength(2));
    expect(server.writes()[1].operations[0]).toEqual({
      type: "task.set_state",
      task_ref: "sanity:sin",
      state: "waiting",
      expected_revision: 1,
      waiting_reason: "A letter from Service Canada",
    });
    // A reason-only save names what changed, not "Waiting to Waiting".
    expect(
      await within(panel).findByText("Updated the waiting reason"),
    ).toBeTruthy();
    expect(within(panel).queryByText("Changed from Waiting to Waiting")).toBe(
      null,
    );

    // Focus stays inside the drawer after the update; Escape closes it and
    // returns focus to the control that opened it.
    expect(panel.contains(document.activeElement)).toBe(true);
    await waitFor(() =>
      expect(within(panel).queryByText("Saving…")).toBeNull(),
    );
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));

    const row = opener.closest("li, [data-task-row], div")!.parentElement!;
    await waitFor(() =>
      expect(
        within(row).getByText("Waiting for: A letter from Service Canada"),
      ).toBeTruthy(),
    );
    expect(within(row).getByText("Waiting")).toBeTruthy();
  });

  it("Undo names its own receipt and restores the earlier state and waiting reason", async () => {
    useServer(
      scriptedServer({
        "sanity:sin": { state: "waiting", reason: "Bank letter", revision: 3 },
      }),
    );
    mount(<ChecklistPage />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Task progress for Get a SIN",
      }),
    );
    const panel = await dialog();
    await waitFor(() =>
      expect(isDisabled(radio(panel, "In progress"))).toBe(false),
    );
    fireEvent.click(radio(panel, "In progress"));
    expect(
      await within(panel).findByText("Changed from Waiting to In progress"),
    ).toBeTruthy();
    const change = server.writes()[0];

    await waitFor(() =>
      expect(
        isDisabled(
          within(panel).getByRole("button", { name: "Undo this change" }),
        ),
      ).toBe(false),
    );
    fireEvent.click(
      within(panel).getByRole("button", { name: "Undo this change" }),
    );
    expect(
      await within(panel).findByText(
        "Undid a change. The task is back to Waiting.",
      ),
    ).toBeTruthy();
    const undo = server.writes()[1];
    expect(undo).toMatchObject({
      action: "undo",
      receipt_operation_id: change.operation_id,
      authorization: { kind: "ui_control" },
    });
    expect(server.row("sanity:sin")).toMatchObject({
      state: "waiting",
      reason: "Bank letter",
    });
    await waitFor(() =>
      expect(
        (
          within(panel).getByLabelText(
            "What are you waiting for?",
          ) as HTMLTextAreaElement
        ).value,
      ).toBe("Bank letter"),
    );
  });

  it("Undo after a newer edit elsewhere keeps the newer state and offers a reviewed change", async () => {
    const { panel } = await openFromChecklist();
    fireEvent.click(radio(panel, "In progress"));
    expect(
      await within(panel).findByText("Changed from Not started to In progress"),
    ).toBeTruthy();

    server.editElsewhere("sanity:sin", "completed");
    await waitFor(() =>
      expect(
        isDisabled(
          within(panel).getByRole("button", { name: "Undo this change" }),
        ),
      ).toBe(false),
    );
    fireEvent.click(
      within(panel).getByRole("button", { name: "Undo this change" }),
    );
    expect(
      await within(panel).findByText("This task changed after that action"),
    ).toBeTruthy();
    expect(
      within(panel).getByText(
        "Undo will not replace the newer progress. Now: Completed. This change would set: Not started.",
      ),
    ).toBeTruthy();
    expect(server.row("sanity:sin")?.state).toBe("completed");

    fireEvent.click(
      within(panel).getByRole("button", { name: "Apply this change" }),
    );
    await waitFor(() =>
      expect(server.row("sanity:sin")?.state).toBe("not_started"),
    );
    expect(server.writes().at(-1)?.authorization).toEqual({
      kind: "approved_proposal",
      proposal_id: PROPOSAL_ID,
      proposal_revision: 1,
    });
  });

  it("a lost response is looked up before any retry and shows the recorded receipt", async () => {
    let drop = true;
    const s = scriptedServer(
      {},
      {
        override: (body) => {
          if (body.action === "apply" && drop) {
            drop = false;
            s.handle(body); // committed, then the reply is lost
            return "network-error";
          }
          return undefined;
        },
      },
    );
    useServer(s);
    const { panel } = await openFromChecklist();
    fireEvent.click(radio(panel, "In progress"));
    expect(
      await within(panel).findByText("Changed from Not started to In progress"),
    ).toBeTruthy();
    expect(
      server.sent.map((b) => b.action).filter((a) => a !== "read"),
    ).toEqual(["apply", "status"]);
  });

  it("pending and failed lookups stay unresolved and never write; not applied retries the same operation", async () => {
    let lookup: "pending" | "fail" | "not_applied" = "pending";
    const s = scriptedServer(
      {},
      {
        override: (body) => {
          if (body.action === "apply" && s.writes().length === 1)
            return "network-error";
          if (body.action === "status") {
            if (lookup === "fail") return "network-error";
            return { status: 200, body: { status: lookup } };
          }
          return undefined;
        },
      },
    );
    useServer(s);
    const { panel } = await openFromChecklist();
    fireEvent.click(radio(panel, "Completed"));
    expect(
      await within(panel).findByText(
        "The change is still being saved. Check again in a moment.",
      ),
    ).toBeTruthy();
    expect(within(panel).queryByRole("button", { name: "Try again" })).toBe(
      null,
    );
    fireEvent.click(radio(panel, "In progress"));
    expect(server.writes()).toHaveLength(1);

    lookup = "fail";
    fireEvent.click(within(panel).getByRole("button", { name: "Check again" }));
    expect(
      await within(panel).findByText(
        "We could not check the result. The change may or may not have saved.",
      ),
    ).toBeTruthy();
    expect(server.writes()).toHaveLength(1);

    lookup = "not_applied";
    fireEvent.click(within(panel).getByRole("button", { name: "Check again" }));
    fireEvent.click(
      await within(panel).findByRole("button", { name: "Try again" }),
    );
    expect(
      await within(panel).findByText("Changed from Not started to Completed"),
    ).toBeTruthy();
    const [first, retry] = server.writes();
    expect(retry.operation_id).toBe(first.operation_id);
    expect(retry.operations).toEqual(first.operations);
  });

  it("offline: controls are off and nothing is sent; reconnecting reads current progress first", async () => {
    useServer(
      scriptedServer({ "sanity:sin": { state: "in_progress", revision: 4 } }),
    );
    mount(<ChecklistPage />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Task progress for Get a SIN",
      }),
    );
    const panel = await dialog();
    await waitFor(() =>
      expect(radio(panel, "In progress").getAttribute("aria-checked")).toBe(
        "true",
      ),
    );

    act(() => setOnline(false));
    expect(
      await within(panel).findByText(
        "You are offline. The progress shown may be out of date, and changes are turned off.",
      ),
    ).toBeTruthy();
    expect(isDisabled(radio(panel, "Waiting"))).toBe(true);
    fireEvent.click(radio(panel, "Waiting"));
    expect(server.writes()).toHaveLength(0);

    server.editElsewhere("sanity:sin", "waiting");
    const readsBefore = server.sent.filter((b) => b.action === "read").length;
    act(() => setOnline(true));
    await waitFor(() =>
      expect(
        server.sent.filter((b) => b.action === "read").length,
      ).toBeGreaterThan(readsBefore),
    );
    await waitFor(() =>
      expect(radio(panel, "Waiting").getAttribute("aria-checked")).toBe("true"),
    );
    await waitFor(() =>
      expect(isDisabled(radio(panel, "Completed"))).toBe(false),
    );
    fireEvent.click(radio(panel, "Completed"));
    await waitFor(() => expect(server.writes()).toHaveLength(1));
    expect(server.writes()[0].operations[0].expected_revision).toBe(5);
  });

  it("an account change drops the previous account's drafts and receipts", async () => {
    const { panel } = await openFromChecklist();
    fireEvent.click(radio(panel, "Waiting"));
    expect(
      await within(panel).findByText("Changed from Not started to Waiting"),
    ).toBeTruthy();
    fireEvent.change(
      within(panel).getByLabelText("What are you waiting for?"),
      {
        target: { value: "Private note of account one" },
      },
    );

    const before = server.sent.length;
    act(() => account.set("someone-else"));
    await waitFor(() =>
      expect(screen.queryByText("Changed from Not started to Waiting")).toBe(
        null,
      ),
    );
    expect(screen.queryByDisplayValue("Private note of account one")).toBe(
      null,
    );
    await waitFor(() =>
      expect(server.sent.slice(before).some((b) => b.action === "read")).toBe(
        true,
      ),
    );
  });

  it("a shown receipt becomes historical after a newer change elsewhere, and its Undo stays tied to it", async () => {
    const { panel } = await openFromChecklist();
    fireEvent.click(radio(panel, "In progress"));
    expect(
      await within(panel).findByText("Changed from Not started to In progress"),
    ).toBeTruthy();
    const mine = server.writes()[0];

    // The mobile app saves a newer change with its own receipt.
    server.handle({
      action: "apply",
      operation_id: "mobile-operation-1",
      authorization: { kind: "ui_control" },
      operations: [
        {
          type: "task.set_state",
          task_ref: "sanity:sin",
          state: "completed",
          expected_revision: 1,
        },
      ],
    });
    // The tab regains focus: saved progress is read again.
    act(() => {
      window.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() =>
      expect(radio(panel, "Completed").getAttribute("aria-checked")).toBe(
        "true",
      ),
    );
    expect(
      await within(panel).findByText(/This task changed after this/),
    ).toBeTruthy();

    await waitFor(() =>
      expect(
        isDisabled(
          within(panel).getByRole("button", { name: "Undo this change" }),
        ),
      ).toBe(false),
    );
    fireEvent.click(
      within(panel).getByRole("button", { name: "Undo this change" }),
    );
    expect(
      await within(panel).findByText("This task changed after that action"),
    ).toBeTruthy();
    expect(
      server.writes().find((b) => b.action === "undo")?.receipt_operation_id,
    ).toBe(mine.operation_id);
    expect(server.row("sanity:sin")?.state).toBe("completed");
  });

  it("sign-out clears unsaved drafts and results; signing in again does not bring them back", async () => {
    const { panel } = await openFromChecklist();
    fireEvent.click(radio(panel, "Waiting"));
    expect(
      await within(panel).findByText("Changed from Not started to Waiting"),
    ).toBeTruthy();
    fireEvent.change(
      within(panel).getByLabelText("What are you waiting for?"),
      {
        target: { value: "Unsaved private note" },
      },
    );
    const me = account.id;
    act(() => account.set(null));
    await waitFor(() =>
      expect(screen.queryByDisplayValue("Unsaved private note")).toBe(null),
    );
    act(() => account.set(me));
    const reopened = await screen.findByRole("dialog");
    const reason = (await within(reopened).findByLabelText(
      "What are you waiting for?",
    )) as HTMLTextAreaElement;
    await waitFor(() => expect(reason.value).toBe(""));
    expect(within(reopened).queryByText("Saved.")).toBe(null);
  });

  it("reports allowlisted action results without private text", async () => {
    const { panel } = await openFromChecklist();
    fireEvent.click(radio(panel, "Waiting"));
    fireEvent.change(
      await within(panel).findByLabelText("What are you waiting for?"),
      { target: { value: "Passport renewal from IRCC" } },
    );
    const save = within(panel).getByRole("button", {
      name: "Save waiting reason",
    });
    await waitFor(() => expect(isDisabled(save)).toBe(false));
    fireEvent.click(save);
    await waitFor(() => expect(server.writes()).toHaveLength(2));

    const events = capture.mock.calls.filter(
      ([name]) => name === "companion_action_result",
    );
    expect(events.length).toBeGreaterThanOrEqual(2);
    for (const [, props] of events) {
      expect(Object.keys(props).sort()).toEqual(
        [
          "action",
          "entry_surface",
          "operation_type",
          "outcome",
          "to_state",
        ].sort(),
      );
      expect(JSON.stringify(props)).not.toMatch(/Passport|IRCC|SIN|sanity:/);
    }
    expect(events[0][1]).toEqual({
      operation_type: "task.set_state",
      action: "set_state",
      outcome: "applied",
      entry_surface: "checklist",
      to_state: "waiting",
    });
  });
});

describe("Companion task entry and drawer (web)", () => {
  it("opens saved tasks from a compact entry, changes one in the drawer, keeps the typed message, and can open Checklist", async () => {
    useServer(
      scriptedServer({ "sanity:sin": { state: "in_progress", revision: 2 } }),
    );
    messageCount = 99; // past the AI allowance: task controls still work
    mount(<CompanionPage />);
    const composer = (await screen.findByLabelText(
      "Message Companion",
    )) as HTMLTextAreaElement;
    fireEvent.change(composer, {
      target: { value: "How do I open a bank account?" },
    });

    await waitFor(() =>
      expect(screen.getByText("In progress: 1 · Waiting: 0")).toBeTruthy(),
    );
    const open = screen.getByRole("button", { name: "Open" });
    open.focus();
    fireEvent.click(open);
    const panel = await dialog();
    fireEvent.click(
      await within(panel).findByRole("button", { name: /Get a SIN/ }),
    );
    await waitFor(() =>
      expect(isDisabled(radio(panel, "Waiting"))).toBe(false),
    );
    fireEvent.click(radio(panel, "Waiting"));
    expect(
      await within(panel).findByText("Changed from In progress to Waiting"),
    ).toBeTruthy();
    expect(generate).not.toHaveBeenCalled();

    const link = within(panel).getByRole("link", { name: /Open in Checklist/ });
    expect(link.getAttribute("href")).toBe("/checklist");

    fireEvent.click(within(panel).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
      (screen.getByLabelText("Message Companion") as HTMLTextAreaElement).value,
    ).toBe("How do I open a bank account?");
    await waitFor(() =>
      expect(screen.getByText("In progress: 0 · Waiting: 1")).toBeTruthy(),
    );
    await waitFor(() => expect(document.activeElement).toBe(open));
    const events = capture.mock.calls.filter(
      ([name]) => name === "companion_action_result",
    );
    expect(events[0][1]).toMatchObject({
      entry_surface: "companion",
      outcome: "applied",
    });
  });
});

// Corrections from the #361 Spec review (F1-F6). Each test names the failing
// condition it was written against.
describe("review corrections (web)", () => {
  const composer = () =>
    screen.getByLabelText("Message Companion") as HTMLTextAreaElement;
  const privateTask = {
    id: "9",
    priority: "Do now",
    title: "Private health appointment",
    description: "Private description of account A",
    completed: false,
    completedAt: null,
    dismissedAt: null,
    isCustom: true,
  };

  it("F1: after an account change, neither Checklist nor Companion shows the previous account's tasks or message draft", async () => {
    const a = account.id;
    tasksByAccount.set(a, [privateTask]);
    tasksByAccount.set("account-b", []);
    useServer(scriptedServer({ "custom:9": { state: "waiting" } }));

    const queryClient = newQueryClient();
    const view = render(
      <Providers queryClient={queryClient}>
        <ChecklistPage />
      </Providers>,
    );
    expect(await screen.findByText("Private description of account A")).toBeTruthy();

    view.rerender(
      <Providers queryClient={queryClient}>
        <CompanionPage />
      </Providers>,
    );
    fireEvent.change(await screen.findByLabelText("Message Companion"), {
      target: { value: "Private draft of account A" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    const panel = await dialog();
    expect(
      await within(panel).findByRole("button", { name: /Private health appointment/ }),
    ).toBeTruthy();
    fireEvent.click(within(panel).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    act(() => account.set("account-b"));
    await waitFor(() => expect(composer().value).toBe(""));
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    const panelB = await dialog();
    expect(
      await within(panelB).findByText("Your Checklist has no tasks yet."),
    ).toBeTruthy();
    expect(screen.queryByText(/Private health appointment/)).toBeNull();

    view.rerender(
      <Providers queryClient={queryClient}>
        <ChecklistPage />
      </Providers>,
    );
    await waitFor(() =>
      expect(screen.queryByText(/Private health appointment/)).toBeNull(),
    );
    expect(screen.queryByText("Private description of account A")).toBeNull();
  });

  it("F2: offline, Try again and Apply this change send nothing", async () => {
    let lookupNotApplied = true;
    const s = scriptedServer(
      {},
      {
        override: (body) => {
          if (body.action === "apply" && lookupNotApplied)
            return "network-error";
          if (body.action === "status" && lookupNotApplied)
            return { status: 200, body: { status: "not_applied" } };
          return undefined;
        },
      },
    );
    useServer(s);
    const { panel } = await openFromChecklist();
    fireEvent.click(radio(panel, "In progress"));
    const retry = await within(panel).findByRole("button", { name: "Try again" });
    expect(server.writes()).toHaveLength(1);
    act(() => setOnline(false));
    await within(panel).findByText(
      "You are offline. The progress shown may be out of date, and changes are turned off.",
    );
    fireEvent.click(retry);
    expect(server.writes()).toHaveLength(1);
    expect(isDisabled(within(panel).getByRole("button", { name: "Try again" }))).toBe(true);

    // Back online: the retry goes through; then a conflicting Undo offers a reviewed change.
    lookupNotApplied = false;
    act(() => setOnline(true));
    await waitFor(() =>
      expect(isDisabled(within(panel).getByRole("button", { name: "Try again" }))).toBe(false),
    );
    fireEvent.click(within(panel).getByRole("button", { name: "Try again" }));
    await within(panel).findByText("Changed from Not started to In progress");
    server.editElsewhere("sanity:sin", "completed");
    const undo = within(panel).getByRole("button", { name: "Undo this change" });
    await waitFor(() => expect(isDisabled(undo)).toBe(false));
    fireEvent.click(undo);
    const apply = await within(panel).findByRole("button", { name: "Apply this change" });
    const writes = server.writes().length;
    act(() => setOnline(false));
    await within(panel).findByText(
      "You are offline. The progress shown may be out of date, and changes are turned off.",
    );
    fireEvent.click(apply);
    expect(server.writes()).toHaveLength(writes);
    expect(server.row("sanity:sin")?.state).toBe("completed");
  });

  it("F3: the composer draft survives opening Checklist from the drawer and coming back", async () => {
    const queryClient = newQueryClient();
    const companion = (
      <Providers queryClient={queryClient}>
        <CompanionPage />
      </Providers>
    );
    const view = render(companion);
    fireEvent.change(await screen.findByLabelText("Message Companion"), {
      target: { value: "Keep my message through Checklist navigation" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    const panel = await dialog();
    fireEvent.click(await within(panel).findByRole("button", { name: /Get a SIN/ }));
    fireEvent.click(within(panel).getByRole("link", { name: /Open in Checklist/ }));
    // The route change unmounts Companion and mounts Checklist, then the user returns.
    view.rerender(
      <Providers queryClient={queryClient}>
        <ChecklistPage />
      </Providers>,
    );
    await screen.findByRole("button", { name: "Task progress for Get a SIN" });
    view.rerender(companion);
    expect((await screen.findByLabelText("Message Companion") as HTMLTextAreaElement).value).toBe(
      "Keep my message through Checklist navigation",
    );
  });

  it("F4: a refused waiting-reason save keeps the typed reason", async () => {
    useServer(
      scriptedServer(
        { "sanity:sin": { state: "waiting", reason: "Old saved reason" } },
        {
          override: (body) =>
            body.action === "apply" && body.operations[0].waiting_reason
              ? {
                  status: 422,
                  body: { error: "invalid_request", reason: "invalid_waiting_reason" },
                }
              : undefined,
        },
      ),
    );
    mount(<ChecklistPage />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Task progress for Get a SIN" }),
    );
    const panel = await dialog();
    const reason = (await within(panel).findByLabelText(
      "What are you waiting for?",
    )) as HTMLTextAreaElement;
    await waitFor(() => expect(reason.value).toBe("Old saved reason"));
    fireEvent.change(reason, {
      target: { value: "Keep this failed waiting-reason draft" },
    });
    const save = within(panel).getByRole("button", { name: "Save waiting reason" });
    await waitFor(() => expect(isDisabled(save)).toBe(false));
    fireEvent.click(save);
    expect(
      await within(panel).findByText("Could not save. Nothing changed."),
    ).toBeTruthy();
    await waitFor(() => expect(server.sent.filter((b) => b.action === "read").length).toBeGreaterThan(1));
    expect(
      (within(panel).getByLabelText("What are you waiting for?") as HTMLTextAreaElement).value,
    ).toBe("Keep this failed waiting-reason draft");
  });

  it("F5: focus stays inside the drawer after keyboard task selection and after a compensating change", async () => {
    mount(<CompanionPage />);
    const open = await screen.findByRole("button", { name: "Open" });
    open.focus();
    fireEvent.click(open);
    const panel = await dialog();
    const row = await within(panel).findByRole("button", { name: /Get a SIN/ });
    row.focus();
    fireEvent.click(row);
    // The pressed row is gone: focus moves to the open task's heading.
    const heading = () => within(panel).getByRole("heading", { name: "Get a SIN" });
    await waitFor(() => expect(document.activeElement).toBe(heading()));

    // Back to the list returns focus to the task that was open.
    const back = within(panel).getByRole("button", { name: "Back to tasks" });
    back.focus();
    fireEvent.click(back);
    const rowAgain = await within(panel).findByRole("button", { name: /Get a SIN/ });
    await waitFor(() => expect(document.activeElement).toBe(rowAgain));

    rowAgain.focus();
    fireEvent.click(rowAgain);
    await waitFor(() => expect(isDisabled(radio(panel, "In progress"))).toBe(false));
    fireEvent.click(radio(panel, "In progress"));
    await within(panel).findByText("Changed from Not started to In progress");
    server.editElsewhere("sanity:sin", "completed");
    const undo = within(panel).getByRole("button", { name: "Undo this change" });
    await waitFor(() => expect(isDisabled(undo)).toBe(false));
    undo.focus();
    fireEvent.click(undo);
    const apply = await within(panel).findByRole("button", { name: "Apply this change" });
    apply.focus();
    fireEvent.click(apply);
    await waitFor(() => expect(server.row("sanity:sin")?.state).toBe("not_started"));
    await waitFor(() => expect(within(panel).queryByText("Saving…")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(heading()));
  });

  it("F6: completing a task in Checklist refreshes its progress before the controls allow a change", async () => {
    useServer(
      scriptedServer({ "sanity:sin": { state: "waiting", reason: "Bank letter" } }),
    );
    mount(<ChecklistPage />);
    await screen.findByText("Waiting for: Bank letter");
    fireEvent.click(screen.getByRole("checkbox", { name: "Mark as done" }));
    await waitFor(() => expect(server.row("sanity:sin")?.state).toBe("completed"));

    fireEvent.click(
      await screen.findByRole("button", { name: "Task progress for Get a SIN" }),
    );
    const panel = await dialog();
    await waitFor(() =>
      expect(radio(panel, "Completed").getAttribute("aria-checked")).toBe("true"),
    );
    expect(radio(panel, "Waiting").getAttribute("aria-checked")).toBe("false");
    expect(screen.queryByText("Waiting for: Bank letter")).toBeNull();
  });
});

// Corrections from the #361 Spec review round 2.
describe("review r2 corrections (web)", () => {
  it("F4: a save reply that arrives after newer typing keeps the newer waiting draft", async () => {
    useServer(
      scriptedServer({ "sanity:sin": { state: "waiting", reason: "Old reason" } }),
    );
    const base = globalThis.fetch;
    let release: () => void = () => {};
    let held = false;
    globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
      const body = JSON.parse(String(args[1]?.body));
      const reply = await base(...args);
      if (body.action === "apply") {
        held = true;
        await new Promise<void>((resolve) => (release = resolve));
      }
      return reply;
    }) as typeof fetch;
    mount(<ChecklistPage />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Task progress for Get a SIN" }),
    );
    const panel = await dialog();
    const reason = (await within(panel).findByLabelText(
      "What are you waiting for?",
    )) as HTMLTextAreaElement;
    await waitFor(() => expect(reason.value).toBe("Old reason"));
    fireEvent.change(reason, { target: { value: "First saved reason" } });
    const save = within(panel).getByRole("button", { name: "Save waiting reason" });
    await waitFor(() => expect(isDisabled(save)).toBe(false));
    fireEvent.click(save);
    await waitFor(() => expect(held).toBe(true));
    fireEvent.change(within(panel).getByLabelText("What are you waiting for?"), {
      target: { value: "New unsaved reason typed during save" },
    });
    await act(async () => release());
    await within(panel).findByText("Updated the waiting reason");
    await waitFor(() => expect(isDisabled(radio(panel, "In progress"))).toBe(false));
    expect(server.row("sanity:sin")?.reason).toBe("First saved reason");
    expect(
      (within(panel).getByLabelText("What are you waiting for?") as HTMLTextAreaElement).value,
    ).toBe("New unsaved reason typed during save");
  });

  it("F5: a task opened before the drawer's first frame keeps focus on the task heading", async () => {
    mount(<CompanionPage />);
    const open = await screen.findByRole("button", { name: "Open" });
    // Warm the task list, then reopen and pick the task in the same tick.
    fireEvent.click(open);
    await within(await dialog()).findByRole("button", { name: /Get a SIN/ });
    fireEvent.click(within(await dialog()).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    open.focus();
    fireEvent.click(open);
    const panel = screen.getByRole("dialog");
    const row = within(panel).getByRole("button", { name: /Get a SIN/ });
    row.focus();
    fireEvent.click(row);
    const heading = within(panel).getByRole("heading", { name: "Get a SIN" });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    // Past the drawer's first frame, focus is still on the task heading.
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(document.activeElement).toBe(heading);
  });
});
