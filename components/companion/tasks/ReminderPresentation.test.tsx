// @vitest-environment jsdom
// Controlled presentation states. This is not service or native proof.
import type { ComponentProps } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { I18nextProvider } from "react-i18next";
import type { TaskProgressView } from "@/hooks/useTaskActions";
import { parseReceipt } from "@/lib/companionActions/contract";
import type { ReminderProposal } from "@/lib/companionActions/reminders";
import type { TaskActionPhase } from "@/lib/companionActions/taskActionStore";
import { testI18n } from "./taskActionsTestHarness";
import { ReminderSection } from "./ReminderSection";

const fixture = vi.hoisted(() => ({
  editor: null as unknown,
  reveals: [] as { open: boolean; instant: boolean }[],
}));
vi.mock("@/hooks/useReminderEditor", () => ({
  useReminderEditor: () => fixture.editor,
}));
vi.mock("@/components/ui/Reveal", async (original) => {
  const actual = await original<typeof import("@/components/ui/Reveal")>();
  return {
    Reveal: (props: ComponentProps<typeof actual.Reveal>) => {
      fixture.reveals.push({ open: props.open, instant: props.instant ?? false });
      return <actual.Reveal {...props} />;
    },
  };
});

const state = () => ({
  draft: { instant: "2027-11-07T01:30-04:00", zone: "America/New_York" },
  phase: { phase: "idle" } as TaskActionPhase,
  proposal: null as ReminderProposal | null,
  active: true,
  confirm: null as "undo" | "cancel" | null,
  canSchedule: true,
  canWrite: true,
  isOwned: () => true,
  prepare: vi.fn(() => Promise.resolve()),
  cancel: vi.fn(() => Promise.resolve()),
  change: vi.fn(),
  save: vi.fn(),
  clearReview: vi.fn(),
  setConfirm: vi.fn(),
  undo: vi.fn(),
  lookup: vi.fn(),
  retry: vi.fn(),
});
let editor: ReturnType<typeof state>;
const view: TaskProgressView = {
  status: "ready", byRef: new Map(), stepsByRef: new Map(), details: [],
  stale: false, canWrite: true, refetch: vi.fn(),
  reminders: { items: [], scheduler: "ready" },
};
const i18n = testI18n();
const panel = () => (
  <I18nextProvider i18n={i18n}>
    <ReminderSection taskRef="sanity:1" view={view} store={null} />
  </I18nextProvider>
);
const proposal: ReminderProposal = {
  proposalId: "review", proposalRevision: 1, kind: "reminder", status: "draft",
  operation: {
    type: "reminder.schedule", task_ref: "sanity:1", expected_revision: 0,
    remind_at: "2027-11-07T01:30:00-04:00", time_zone: "America/New_York",
    wall_time: "2027-11-07T01:30:00",
  },
};
beforeEach(() => { editor = state(); fixture.editor = editor; fixture.reveals = []; });
afterEach(cleanup);

it.each(["saving", "checking"] as const)("delays only the transient %s message", phase => {
  editor.phase = { phase, write: { operationId: "held", kind: "apply" } };
  render(panel());
  const status = screen.getByRole("status");
  expect(status.textContent).toContain(i18n.t(`taskActions.${phase}`));
  expect(status.classList.contains("loading-delayed")).toBe(true);
});

it.each(["pending", "lookup_failed", "not_applied"] as const)("keeps %s recovery visible at once", phase => {
  editor.phase = { phase, write: { operationId: "held", kind: "apply" } };
  render(panel());
  const control = screen.getByRole("button", {
    name: i18n.t(phase === "not_applied" ? "taskActions.retry" : "taskActions.checkAgain"),
  });
  expect(control.closest(".loading-delayed")).toBeNull();
  expect(control.hasAttribute("disabled")).toBe(false);
});

it.each([
  ["schedule", 0], ["schedule", 1], ["cancel", 0], ["cancel", 1],
] as const)("keeps %s input method across held preparation (detail %s)", async (action, detail) => {
  let finish!: () => void;
  const held = new Promise<void>(resolve => { finish = resolve; });
  editor[action === "schedule" ? "prepare" : "cancel"].mockReturnValue(held);
  const mounted = render(panel());
  const button = screen.getByRole("button", {
    name: i18n.t(action === "schedule" ? "reminders.review" : "reminders.cancel"),
  });
  if (detail === 0) { button.focus(); fireEvent.keyDown(button, { key: "Enter" }); }
  fireEvent.click(button, { detail });
  expect(editor[action === "schedule" ? "prepare" : "cancel"]).toHaveBeenCalledOnce();
  await act(async () => { finish(); await held; });
  editor.proposal = action === "schedule" ? proposal : {
    ...proposal,
    operation: { type: "reminder.cancel", task_ref: "sanity:1", expected_revision: 0,
      reminder_id: "reminder-1", expected_reminder_revision: 0 },
  };
  fixture.reveals = [];
  mounted.rerender(panel());
  expect(fixture.reveals.filter(r => r.open)).toEqual([{ open: true, instant: detail === 0 }]);
});

it.each([0, 1] as const)("uses the Undo activation method (detail %s)", detail => {
  editor.phase = { phase: "saved", receipt: parseReceipt({
    operation_id: "saved", created_at: "2026-10-29T00:00:00Z", kind: "change",
    operation_type: "reminder.schedule", task_ref: "sanity:1", before_state: "not_started",
    after_state: "not_started", after_revision: 0, undone_by: null, undo_of: null,
    current: true, undoable: true,
    reminder: { reminder_id: "reminder-1", remind_at: "2027-11-07T01:30:00-04:00",
      time_zone: "America/New_York", scheduling: "registered" },
  }) };
  editor.setConfirm.mockImplementation(value => { editor.confirm = value; });
  const mounted = render(panel());
  const button = screen.getByRole("button", { name: i18n.t("taskActions.undo") });
  if (detail === 0) { button.focus(); fireEvent.keyDown(button, { key: "Enter" }); }
  fireEvent.click(button, { detail });
  fixture.reveals = [];
  mounted.rerender(panel());
  expect(fixture.reveals.filter(r => r.open)).toEqual([{ open: true, instant: detail === 0 }]);
});

it("uses approved surface, ink and border tokens", () => {
  editor.proposal = proposal;
  const mounted = render(panel());
  expect(mounted.container.querySelector('[class*="gray-"]')).toBeNull();
  expect(screen.getByRole("heading", { name: i18n.t("reminders.title") })
    .classList.contains("text-ink-secondary")).toBe(true);
});
