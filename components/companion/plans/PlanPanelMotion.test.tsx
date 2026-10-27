// @vitest-environment jsdom
// The real PlanPanel and Reveal, with controlled hooks and no network. These
// checks cover disclosure entrances, not authorization or browser timing.
import { useSyncExternalStore } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInstance } from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import en from "@/lib/i18n/locales/en/translation.json";
import type {
  PlanProposal,
  PlanReceipt,
  PlanView,
} from "@/lib/companionActions/planContract";
import type { PlanPhase } from "@/lib/companionActions/planStore";
import { PlanPanel } from "./PlanPanel";

const session = vi.hoisted(() => ({
  phase: { phase: "idle" } as PlanPhase,
  listeners: new Set<() => void>(),
  store: { undo: vi.fn(), approve: vi.fn(), dismiss: vi.fn() },
}));
const receipt: PlanReceipt = {
  operationId: "plan-op",
  createdAt: "2026-10-27T00:00:00Z",
  kind: "plan",
  planId: "plan-1",
  status: "applied",
  results: [
    {
      key: "new-1",
      taskRef: "custom:1",
      title: "Phone service",
      label: null,
      outcome: "created",
      reason: null,
      itemOperationId: "item-op",
      planProposalId: null,
    },
  ],
  retryable: [],
  retryOf: null,
  planProposalId: null,
  undoneBy: null,
  undoable: true,
  removalCount: 1,
};
const plan: PlanView = {
  planId: "plan-1",
  goal: "First week",
  revision: 1,
  removed: false,
  context: null,
  source: null,
  proposalId: null,
  items: [],
  receipt,
  review: null,
  updatedAt: "2026-10-27T00:00:00Z",
};
const compensation: PlanProposal = {
  id: "undo-proposal",
  revision: 1,
  status: "draft",
  kind: "undo",
  goal: "First week",
  items: [],
  rawItems: [],
  context: null,
  previousContext: null,
  reviewReason: null,
  source: null,
  undoOf: "plan-op",
  retryOf: null,
  changeCount: 0,
  unresolved: [],
  tasks: [],
  planId: "plan-1",
  receipt: null,
};
const idle: PlanPhase = { phase: "idle" };
vi.mock("@/hooks/useTaskActions", () => ({
  useTaskProgress: () => ({ canWrite: true, stale: false }),
}));
vi.mock("@/hooks/usePlans", () => ({
  usePlans: () => ({ status: "ready", plans: [plan], drafts: [] }),
  usePlanStore: () => session.store,
  usePlanPhase: (_store: unknown, key: string) =>
    useSyncExternalStore(
      (listener) => {
        session.listeners.add(listener);
        return () => session.listeners.delete(listener);
      },
      () => (key === "plan-receipt:plan-op" ? session.phase : idle),
    ),
  usePlanClient: () => null,
  usePlanProposal: () => ({}),
}));

beforeEach(() => {
  session.phase = idle;
  session.store.undo.mockReset();
  session.store.undo.mockImplementation(async () => {
    session.phase = {
      phase: "undo_review",
      proposal: compensation,
      current: [
        { taskRef: "custom:1", title: "Newer phone title", state: "waiting" },
      ],
    };
    for (const listener of session.listeners) listener();
  });
  vi.stubGlobal("fetch", () => {
    throw new Error("Unexpected network request");
  });
});
afterEach(() => {
  cleanup();
  session.listeners.clear();
  vi.unstubAllGlobals();
});

describe("plan Undo disclosures", () => {
  it.each([
    ["confirmation", 1],
    ["confirmation", 0],
    ["conflict", 1],
    ["conflict", 0],
  ] as const)(
    "%s preserves the entrance rule for click detail %i",
    async (kind, detail) => {
      const i18n = createInstance();
      await i18n
        .use(initReactI18next)
        .init({
          lng: "en",
          resources: { en: { translation: en } },
          interpolation: { escapeValue: false },
        });
      render(
        <I18nextProvider i18n={i18n}>
          <PlanPanel target={{ planId: "plan-1" }} onOpenTask={() => {}} />
        </I18nextProvider>,
      );
      fireEvent.click(
        screen.getByRole("button", { name: "Undo plan change" }),
        { detail },
      );
      if (kind === "conflict") {
        fireEvent.click(screen.getByRole("button", { name: "Undo plan" }), {
          detail,
        });
        expect(session.store.undo).toHaveBeenCalledWith("plan-op", {
          removalConfirmed: true,
        });
        expect(screen.getByText(/Newer phone title/)).toBeTruthy();
      }
      const wrapper = screen.getByRole("group").parentElement!;
      if (detail === 1) expect(wrapper.style.opacity).toBe("0");
      else {
        expect(wrapper.style.opacity).not.toBe("0");
        expect(wrapper.style.transform).not.toContain("-4");
      }
    },
  );
});
