// @vitest-environment jsdom
// The real page, card, drawer selection, task panel and receipt use controlled account/progress inputs.
import React, { type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createInstance } from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import en from "@/lib/i18n/locales/en/translation.json";
import type { ChatMessage, ChecklistTask } from "@/types";
import type { RemovalProposal, TaskReceipt } from "@/lib/companionActions/contract";
import CompanionPage from "@/app/(main)/companion/page";

const fixture = vi.hoisted(() => ({
  tasks: [] as ChecklistTask[], receipt: null as TaskReceipt | null,
  proposal: null as RemovalProposal | null, refetch: vi.fn(), undo: vi.fn(), requestRemoval: vi.fn(),
}));
vi.mock("@/hooks/useProfile", () => ({ useCurrentUser: () => ({ data: { id: "owner-1" } }) }));
vi.mock("@/hooks/useChecklist", () => ({ useTasks: () => ({ data: fixture.tasks, isLoading: false }) }));
vi.mock("@/services/checklist", () => ({ taskOrderKey: (task: ChecklistTask) => `${task.isCustom ? "custom" : "sanity"}:${task.id}` }));
vi.mock("@/lib/accountSession", () => ({ ownAccountWork: vi.fn(), stillOwned: () => true }));
vi.mock("@/services/companion", () => ({ ChatLimitError: class extends Error {}, FREE_TIER_DAILY_LIMIT: 6 }));
vi.mock("@/hooks/usePlans", () => ({ useConversationPlans: () => ({ data: [] }), usePlanStore: () => null }));
vi.mock("@/components/companion/plans/PlanEntry", () => ({ PlanEntry: () => null }));
vi.mock("@/components/companion/plans/PlanCards", () => ({ PlanCards: () => null }));
vi.mock("@/hooks/useCompanion", () => ({
  messagesKey: (id: string) => ["messages", id],
  useConversations: () => ({ data: [{ id: "conversation-1", title: "First week" }] }),
  useConversationMessages: (id: string | null) => ({ data: id ? [{ id: 77, role: "user", content: "Remove task: Get a phone plan", conversationId: id, sources: null, createdAt: "2026-10-29T00:00:00Z" }] : [] }),
  useChatbotUsage: () => ({ data: { messageCount: 0, isPremium: false } }),
  useCreateConversation: () => ({ mutateAsync: vi.fn() }),
  useSendMessage: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteConversation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/useTaskActions", () => ({
  useTaskActionClient: () => null,
  useConversationActions: (id: string | null) => ({ data: { removalProposals: id && fixture.proposal ? [fixture.proposal] : [] } }),
  useTaskActionPhase: () => ({ phase: "idle" }),
  useTaskActionDraft: () => undefined,
  useTaskActionStore: () => ({ subscribe: () => () => {}, draft: () => undefined, undo: fixture.undo, requestRemoval: fixture.requestRemoval }),
  useTaskProgress: () => ({ status: "ready", stale: false, canWrite: true, refetch: fixture.refetch, details: [], stepsByRef: new Map(),
    byRef: new Map([["custom:1", { taskRef: "custom:1", state: "not_started", revision: 4, waitingReason: null, removed: true, lastReceipt: fixture.receipt }]]) }),
  useStepProposal: () => ({ data: null }),
}));
vi.mock("@/components/companion/ConversationList", () => ({ ConversationList: ({ onSelect }: { onSelect: (id: string) => void }) => <button onClick={() => onSelect("conversation-1")}>Open retained conversation</button> }));
vi.mock("@/components/companion/ChatPanel", () => ({ ChatPanel: ({ messages, renderAfterMessage }: { messages: ChatMessage[]; renderAfterMessage: (message: ChatMessage) => ReactNode }) => <>{messages.map(m => <div key={m.id}>{renderAfterMessage(m)}</div>)}</> }));
vi.mock("@/components/companion/tasks/TaskDrawer", () => ({ TaskDrawer: ({ open, children }: { open: boolean; children: ReactNode }) => open ? <div role="dialog">{children}</div> : null }));
vi.mock("@/components/companion/tasks/TaskProposalPanel", () => ({ TaskProposalPanel: () => null }));
vi.mock("@/components/companion/tasks/StepProposalPanel", () => ({ StepProposalPanel: () => null }));
vi.mock("@/components/companion/tasks/SavedDetails", () => ({ DetailProposalPanel: () => null, SavedDetailsPanel: () => null }));
vi.mock("@/components/companion/plans/PlanPanel", () => ({ PlanPanel: () => null }));
vi.mock("@/components/companion/tasks/TaskStepsSection", () => ({ TaskStepsSection: () => null }));
vi.mock("@/components/companion/tasks/TaskRemovalSection", () => ({ TaskRemovalSection: () => null }));

let client: QueryClient;
beforeEach(() => {
  vi.clearAllMocks(); fixture.tasks = [];
  fixture.receipt = { operationId: "current-removal", createdAt: "2026-10-29T00:00:00Z", kind: "change", operationType: "task.remove", title: "Get a phone plan", changes: [], undoOf: null, taskRef: "custom:1", beforeState: "not_started", afterState: "not_started", afterRevision: 4, undoneBy: null, current: true, undoable: true, steps: null, stepsDone: null, stepsTotal: null, waitingReasons: null, detail: null, plans: [], stepsKept: 2, remindersStopped: 0 };
  fixture.proposal = { proposalId: "old-review", proposalRevision: 1, status: "draft", operation: { type: "task.remove", task_ref: "custom:1", expected_revision: 3 }, effects: { taskRef: "custom:1", title: "Get a phone plan", state: "not_started", revision: 3, removed: false, plans: [], stepsTotal: 2, remindersPending: 0 }, previousEffects: null, reviewReason: null, source: { conversationId: "conversation-1", messageId: 77 }, receipt: null };
  client = new QueryClient();
});
afterEach(() => { cleanup(); client.clear(); });

it.each([false, true])("reaches the removed task receipt after reload (same-id content task: %s)", async (collidingTask) => {
  if (collidingTask) fixture.tasks = [{ id: "1", title: "Get a SIN", description: "", priority: "Do now", completed: false, completedAt: null, dismissedAt: null, isCustom: false }];
  const i18n = createInstance();
  void i18n.use(initReactI18next).init({ lng: "en", resources: { en: { translation: en } }, initImmediate: false });
  render(<QueryClientProvider client={client}><I18nextProvider i18n={i18n}><CompanionPage /></I18nextProvider></QueryClientProvider>);
  fireEvent.click(screen.getAllByRole("button", { name: "Open retained conversation" })[0]);
  fireEvent.click(await screen.findByRole("button", { name: "View task" }));
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(await screen.findByRole("heading", { name: "Get a phone plan" })).toBeTruthy();
  await waitFor(() => expect(fixture.refetch).toHaveBeenCalled());
  const undo = screen.getByRole("button", { name: /^Undo:/ });
  expect(undo.getAttribute("aria-disabled")).toBe("false");
  expect(fixture.requestRemoval).not.toHaveBeenCalled();
  expect(fixture.undo).not.toHaveBeenCalled();
  fireEvent.click(undo);
  expect(fixture.undo).toHaveBeenCalledWith("custom:1", "current-removal");
});
