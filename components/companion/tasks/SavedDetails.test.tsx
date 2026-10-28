// @vitest-environment jsdom
//
// Mounted acceptance for saved personal details on web (mobile-app#370): the real
// Companion page, the real send hook, cards, overlay drawer and controls, the real
// client, store and query cache. Conversations and AI answers are controlled stand-ins
// (services/companion); the action service is the scripted contract stand-in in
// taskActionsTestHarness.tsx. Authorization, revisions, receipts, persistence and
// what later answers read are proven against the real endpoint and database in
// supabase/tests/companion-actions/details_test.ts (run.sh).
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

const FRIDAYS = "I can attend appointments on Fridays";
const reply = (answer: string, detail: string | null) => ({
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
  actionProposal: detail ? { type: "detail.create", text: detail } : null,
});

async function send(text: string) {
  const box = screen.getByRole("textbox", { name: /message/i });
  fireEvent.change(box, { target: { value: text } });
  fireEvent.keyDown(box, { key: "Enter" });
}

const detailWrites = () =>
  server.sent.filter(
    (b) =>
      (b.action === "apply" &&
        String(b.operations?.[0]?.type).startsWith("detail.")) ||
      b.action === "undo",
  );
const enabled = (el: HTMLElement) =>
  el.getAttribute("aria-disabled") !== "true";

/** Saves a detail with a clear remember command and opens the saved details. */
async function rememberAndOpen(text = FRIDAYS) {
  await send(`Remember that ${text}`);
  const card = await screen.findByTestId("detail-command-card");
  await within(card).findByText(`Saved: “${text}”.`);
  fireEvent.click(
    within(card).getByRole("button", { name: "View saved details" }),
  );
  const drawer = await screen.findByRole("dialog", { name: "Saved details" });
  await within(drawer).findByText(text);
  return { card, drawer };
}

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

// The offline case turns React Query's online manager off: every test starts online.
import { onlineManager } from "@tanstack/react-query";
beforeEach(() => onlineManager.setOnline(true));

// ---------------------------------------------------------------- tests
describe("Saved personal details through Companion (web, #370)", () => {
  it("a clear remember message saves exactly that detail once, with no AI answer; analytics never carries it", async () => {
    // Wrong if: the model is asked, the saved text differs, the command writes twice,
    // or the detail reaches analytics.
    useServer(scriptedServer());
    mount(<CompanionPage />);
    await send(`Remember that ${FRIDAYS}.`);
    const card = await screen.findByTestId("detail-command-card");
    expect(await within(card).findByText(`Saved: “${FRIDAYS}”.`)).toBeTruthy();
    expect(generateReply).not.toHaveBeenCalled();
    expect(detailWrites()).toHaveLength(1);
    expect(detailWrites()[0].operations).toEqual([
      { type: "detail.create", text: FRIDAYS },
    ]);
    expect(detailWrites()[0].authorization).toEqual({
      kind: "direct_command",
      message_id: saved[0].id,
    });
    for (const call of capture.mock.calls)
      expect(JSON.stringify(call)).not.toMatch(/Fridays/);
    expect(
      capture.mock.calls.find((c) => c[0] === "companion_action_result")?.[1],
    ).toMatchObject({
      action: "command_detail",
      operation_type: "detail.create",
      outcome: "applied",
    });
  });

  it("an inferred detail is only a draft: Not now saves nothing; approval saves it once; the typed message stays", async () => {
    // Wrong if: a suggestion is saved before approval, Not now writes, a double click
    // saves twice, or the typed message is lost.
    useServer(scriptedServer());
    generateReply.mockResolvedValue(
      reply("Fridays work for many offices.", FRIDAYS),
    );
    mount(<CompanionPage />);
    await send("I can only go on Fridays.");
    const card = await screen.findByTestId("detail-draft-card");
    expect(
      within(card).getByText("Needs your approval. Not saved."),
    ).toBeTruthy();
    expect(server.details()).toEqual([]);
    fireEvent.click(
      within(card).getByRole("button", {
        name: `Review the suggested detail: ${FRIDAYS}`,
      }),
    );
    let drawer = await screen.findByRole("dialog", {
      name: "Remember this detail?",
    });
    fireEvent.click(
      await within(drawer).findByRole("button", { name: "Not now" }),
    );
    expect(await within(drawer).findByText("Not saved.")).toBeTruthy();
    expect(detailWrites()).toHaveLength(0);
    fireEvent.click(within(drawer).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await send("Fridays are best for me.");
    await waitFor(() =>
      expect(screen.getAllByTestId("detail-draft-card")).toHaveLength(2),
    );
    const box = screen.getByRole("textbox", { name: /message/i });
    fireEvent.change(box, { target: { value: "My next question" } });
    fireEvent.click(
      within(screen.getAllByTestId("detail-draft-card")[1]).getByRole(
        "button",
        { name: `Review the suggested detail: ${FRIDAYS}` },
      ),
    );
    drawer = await screen.findByRole("dialog", {
      name: "Remember this detail?",
    });
    const approve = await within(drawer).findByRole("button", {
      name: "Remember this",
    });
    await waitFor(() => expect(enabled(approve)).toBe(true));
    fireEvent.click(approve);
    fireEvent.click(approve);
    expect(
      await within(drawer).findByText(`Saved: “${FRIDAYS}”.`),
    ).toBeTruthy();
    expect(detailWrites()).toHaveLength(1);
    expect(detailWrites()[0].authorization).toMatchObject({
      kind: "approved_proposal",
      proposal_revision: 1,
    });
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
      (screen.getByRole("textbox", { name: /message/i }) as HTMLTextAreaElement)
        .value,
    ).toBe("My next question");
  });

  it("edits at the revision shown and keeps typed text through close and reopen; the command receipt becomes history", async () => {
    // Wrong if: the typed edit is lost when the drawer closes, the edit names another
    // revision, or a receipt does not name the exact change.
    useServer(scriptedServer());
    mount(<CompanionPage />);
    let { drawer } = await rememberAndOpen();
    fireEvent.click(
      within(drawer).getByRole("button", {
        name: `Edit saved detail: ${FRIDAYS}`,
      }),
    );
    fireEvent.change(within(drawer).getByLabelText("Saved detail"), {
      target: { value: "I can attend appointments on Saturdays" },
    });
    fireEvent.click(within(drawer).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(
      within(screen.getByTestId("detail-command-card")).getByRole("button", {
        name: "View saved details",
      }),
    );
    drawer = await screen.findByRole("dialog", { name: "Saved details" });
    expect(
      (within(drawer).getByLabelText("Saved detail") as HTMLTextAreaElement)
        .value,
    ).toBe("I can attend appointments on Saturdays");
    const save = within(drawer).getByRole("button", { name: "Save change" });
    await waitFor(() => expect(enabled(save)).toBe(true));
    fireEvent.click(save);
    expect(
      await within(drawer).findByText(
        `Changed “${FRIDAYS}” to “I can attend appointments on Saturdays”.`,
      ),
    ).toBeTruthy();
    const edit = detailWrites().find(
      (w) => w.operations?.[0]?.type === "detail.update",
    )!;
    expect(edit.operations[0]).toEqual({
      type: "detail.update",
      detail_id: server.details()[0].detail_id,
      text: "I can attend appointments on Saturdays",
      expected_revision: 1,
    });
    fireEvent.click(within(drawer).getByRole("button", { name: "Close" }));
    const card = screen.getByTestId("detail-command-card");
    await within(card).findByText(
      "Saved earlier. This detail has changed since.",
    );
    expect(within(card).getByText(`Saved: “${FRIDAYS}”.`)).toBeTruthy();
  });

  it("every removal asks first; Cancel sends nothing; Remove names the detail and its Undo restores it", async () => {
    // Wrong if: a removal is sent without confirmation, Cancel writes, or Undo is not
    // tied to the removal receipt.
    useServer(scriptedServer());
    mount(<CompanionPage />);
    const { drawer } = await rememberAndOpen();
    const before = detailWrites().length;
    fireEvent.click(
      within(drawer).getByRole("button", {
        name: `Remove saved detail: ${FRIDAYS}`,
      }),
    );
    expect(within(drawer).getByText("Remove this saved detail?")).toBeTruthy();
    fireEvent.click(within(drawer).getByRole("button", { name: "Cancel" }));
    expect(detailWrites()).toHaveLength(before);
    fireEvent.click(
      within(drawer).getByRole("button", {
        name: `Remove saved detail: ${FRIDAYS}`,
      }),
    );
    fireEvent.click(
      within(drawer).getByRole("button", { name: "Remove detail" }),
    );
    expect(
      await within(drawer).findByText(
        `Removed “${FRIDAYS}”. It will not be used in later conversations.`,
      ),
    ).toBeTruthy();
    const removal = detailWrites()[detailWrites().length - 1];
    expect(removal.authorization).toEqual({
      kind: "ui_control",
      removal_confirmed: true,
    });
    await waitFor(() =>
      expect(within(drawer).queryAllByTestId("saved-detail-row")).toHaveLength(
        0,
      ),
    );
    const undo = await within(drawer).findByRole("button", {
      name: `Undo removing “${FRIDAYS}”`,
    });
    await waitFor(() => expect(enabled(undo)).toBe(true));
    fireEvent.click(undo);
    expect(
      await within(drawer).findByText(`Restored “${FRIDAYS}”.`),
    ).toBeTruthy();
    const sent = detailWrites()[detailWrites().length - 1];
    expect([sent.action, sent.receipt_operation_id]).toEqual([
      "undo",
      removal.operation_id,
    ]);
    expect(server.details()[0].removed).toBe(false);
  });

  it("the Undo of a save asks first; offline, edits and removals are off and send nothing", async () => {
    // Wrong if: the Undo of a save is sent without confirmation, or a write is sent
    // without a connection.
    useServer(scriptedServer());
    mount(<CompanionPage />);
    await send(`Remember that ${FRIDAYS}`);
    const card = await screen.findByTestId("detail-command-card");
    const undoSave = await within(card).findByRole("button", {
      name: `Undo saving “${FRIDAYS}”`,
    });
    await waitFor(() => expect(enabled(undoSave)).toBe(true));
    const before = detailWrites().length;
    fireEvent.click(undoSave);
    expect(detailWrites()).toHaveLength(before);
    expect(
      within(card).getByText(
        `Undoing this removes “${FRIDAYS}”. It will no longer be used in later conversations.`,
      ),
    ).toBeTruthy();
    fireEvent.click(within(card).getByRole("button", { name: "Cancel" }));
    expect(detailWrites()).toHaveLength(before);

    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => false,
    });
    await act(async () => {
      window.dispatchEvent(new Event("offline"));
    });
    fireEvent.click(
      within(card).getByRole("button", { name: "View saved details" }),
    );
    const drawer = await screen.findByRole("dialog", { name: "Saved details" });
    const edit = within(drawer).getByRole("button", {
      name: `Edit saved detail: ${FRIDAYS}`,
    });
    await waitFor(() => expect(enabled(edit)).toBe(false));
    fireEvent.click(edit);
    fireEvent.click(
      within(drawer).getByRole("button", {
        name: `Remove saved detail: ${FRIDAYS}`,
      }),
    );
    expect(detailWrites()).toHaveLength(before);
  });

  it("an account change drops the previous account's details and typed edits", async () => {
    // Wrong if: the next account sees the previous account's detail or its typed edit.
    useServer(scriptedServer());
    mount(<CompanionPage />);
    const { drawer } = await rememberAndOpen();
    fireEvent.click(
      within(drawer).getByRole("button", {
        name: `Edit saved detail: ${FRIDAYS}`,
      }),
    );
    fireEvent.change(within(drawer).getByLabelText("Saved detail"), {
      target: { value: "Typed by the first account" },
    });
    // The next account's own records (the stand-in holds one account at a time).
    useServer(scriptedServer());
    await act(async () => account.set("web-user-2"));
    await waitFor(() => expect(screen.queryByText(FRIDAYS)).toBeNull());
    expect(screen.queryByDisplayValue("Typed by the first account")).toBeNull();
  });
});
