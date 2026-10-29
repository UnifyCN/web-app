// @vitest-environment jsdom
// Rendered client proof. The scripted endpoint is not database or native proof.
import { useSyncExternalStore } from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { afterEach, beforeEach, it, expect, vi } from "vitest";
import { I18nextProvider } from "react-i18next";
import { testI18n } from "./taskActionsTestHarness";
import {
  createTaskActionClient,
  type TaskActionClient,
  type TransportReply,
} from "@/lib/companionActions/client";
import { TaskActionStore } from "@/lib/companionActions/taskActionStore";
import { noteAccount, ownAccountWork } from "@/lib/accountSession";
import { ReminderSection, ReminderList } from "./ReminderSection";
import type { TaskProgressView } from "@/hooks/useTaskActions";
const fixture = vi.hoisted(() => ({ bound: null as unknown }));
vi.mock("@/hooks/useTaskActions", () => ({
  useTaskActionClient: () => fixture.bound,
  useTaskActionDraft: (store: TaskActionStore | null, key: string) =>
    useSyncExternalStore(
      store?.subscribe ?? (() => () => {}),
      () => store?.draft(key),
      () => undefined,
    ),
  useTaskActionPhase: (store: TaskActionStore | null, key: string) =>
    useSyncExternalStore(
      store?.subscribe ?? (() => () => {}),
      () => store!.get(key),
      () => store!.get(key),
    ),
}));
let calls: Record<string, unknown>[];
let client: TaskActionClient;
let store: TaskActionStore;
let override: (
  body: Record<string, unknown>,
) => TransportReply | Promise<TransportReply> | undefined;
const receipt = (id: string) => ({
  operation_id: id,
  created_at: "2026-10-29T00:00:00Z",
  kind: "change",
  operation_type: "reminder.schedule",
  task_ref: "sanity:1",
  before_state: "not_started",
  after_state: "not_started",
  after_revision: 0,
  undone_by: null,
  undo_of: null,
  current: true,
  undoable: true,
  reminder: {
    reminder_id: "reminder-1",
    remind_at: "2027-11-07T01:30:00-04:00",
    time_zone: "America/New_York",
    scheduling: "registered",
  },
});
const view = (): TaskProgressView => ({
  status: "ready",
  byRef: new Map(),
  stepsByRef: new Map(),
  details: [],
  stale: false,
  canWrite: true,
  refetch: vi.fn(),
  reminders: { items: [], scheduler: "ready" },
});
const mount = (v = view(), s = store) =>
  render(
    <I18nextProvider i18n={testI18n()}>
      <ReminderSection taskRef="sanity:1" view={v} store={s} />
    </I18nextProvider>,
  );
beforeEach(() => {
  calls = [];
  override = () => undefined;
  noteAccount("a");
  client = createTaskActionClient({
    platform: "web",
    appVersion: "test",
    transport: async (body) => {
      calls.push(body);
      const result = override(body);
      if (result) return result;
      if (body.action === "prepare")
        return {
          status: 200,
          body: {
            proposal: {
              proposal_id: "proposal-1",
              proposal_revision: 2,
              kind: "reminder",
              status: "draft",
              operations: [body.operation],
            },
          },
        };
      if (body.action === "apply")
        return {
          status: 200,
          body: { receipt: receipt(String(body.operation_id)) },
        };
      return { status: 200, body: { status: "not_applied" } };
    },
  });
  fixture.bound = { client, owner: ownAccountWork() };
  let i = 0;
  store = new TaskActionStore({
    client,
    newOperationId: () => `operation-${++i}`,
    onChanged: () => {},
  });
});
afterEach(() => cleanup());
function fill() {
  fireEvent.change(screen.getByLabelText("Date and time with UTC offset"), {
    target: { value: "2027-11-07T01:30-04:00" },
  });
  fireEvent.change(screen.getByLabelText("Time zone"), {
    target: { value: "America/New_York" },
  });
}
it("reviews offset and named zone, saves only the exact approved revision and preserves its editing draft", async () => {
  const result = mount();
  fill();
  fireEvent.click(screen.getByRole("button", { name: "Review reminder" }));
  await screen.findByRole("button", { name: "Save reminder" });
  expect(screen.getByText(/GMT-04:00.*America\/New_York/)).toBeTruthy();
  expect(calls.filter((b) => b.action === "apply")).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Save reminder" }));
  await screen.findByText("Reminder saved.");
  const write = calls.find((b) => b.action === "apply")!;
  expect(write.authorization).toEqual({
    kind: "approved_proposal",
    proposal_id: "proposal-1",
    proposal_revision: 2,
  });
  expect((write.operations as unknown[])[0]).toMatchObject({
    task_ref: "sanity:1",
    remind_at: "2027-11-07T01:30:00-04:00",
    wall_time: "2027-11-07T01:30:00",
  });
  result.unmount();
  mount();
  expect(
    (screen.getByLabelText("Date and time with UTC offset") as HTMLInputElement)
      .value,
  ).toBe("2027-11-07T01:30-04:00");
});
it("rejects a DST gap and an offset-free fold without making a write or draft request", async () => {
  mount();
  fill();
  const input = screen.getByLabelText("Date and time with UTC offset");
  for (const invalid of ["2027-03-14T02:30-05:00", "2027-11-07T01:30"]) {
    fireEvent.change(input, { target: { value: invalid } });
    fireEvent.click(screen.getByRole("button", { name: "Review reminder" }));
    await screen.findByRole("alert");
    expect(calls).toHaveLength(0);
  }
});
it("looks up an unknown save and retries only a confirmed unapplied operation with its original identity", async () => {
  let writes = 0;
  override = (body) =>
    body.action === "apply" && ++writes === 1
      ? { status: 500, body: {} }
      : undefined;
  mount();
  fill();
  fireEvent.click(screen.getByRole("button", { name: "Review reminder" }));
  fireEvent.click(await screen.findByRole("button", { name: "Save reminder" }));
  await screen.findByText("The change did not save.");
  expect(calls.map((b) => b.action)).toEqual(["prepare", "apply", "status"]);
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByText("Reminder saved.");
  const applies = calls.filter((b) => b.action === "apply");
  expect(applies[1]).toEqual(applies[0]);
});
it("blocks offline writes and discards a delayed approval response after account change", async () => {
  let resolve!: (r: TransportReply) => void;
  override = (body) =>
    body.action === "prepare" ? new Promise((r) => (resolve = r)) : undefined;
  const mounted = mount();
  fill();
  fireEvent.click(screen.getByRole("button", { name: "Review reminder" }));
  await waitFor(() => expect(calls).toHaveLength(1));
  noteAccount("b");
  fixture.bound = { client, owner: ownAccountWork() };
  const other = new TaskActionStore({
    client,
    newOperationId: () => "",
    onChanged: () => {},
  });
  mounted.rerender(
    <I18nextProvider i18n={testI18n()}>
      <ReminderSection
        taskRef="sanity:1"
        view={{ ...view(), canWrite: false, stale: true }}
        store={other}
      />
    </I18nextProvider>,
  );
  resolve({
    status: 200,
    body: {
      proposal: {
        proposal_id: "old",
        proposal_revision: 1,
        kind: "reminder",
        status: "draft",
        operations: [calls[0].operation],
      },
    },
  });
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Save reminder" })).toBeNull(),
  );
  expect(
    (screen.getByLabelText("Date and time with UTC offset") as HTMLInputElement)
      .value,
  ).toBe("");
  fireEvent.click(screen.getByRole("button", { name: "Review reminder" }));
  expect(calls).toHaveLength(1);
});
it("opens the full stable task reference and hides a due claim after a read failure", () => {
  const v = view();
  v.reminders!.items = [
    {
      reminderId: "r",
      taskRef: "sanity:1",
      title: "Same id content",
      remindAt: "2027-11-07T05:30:00Z",
      timeZone: "America/New_York",
      wallTime: "2027-11-07T01:30:00",
      revision: 1,
      status: "pending",
      due: true,
      dueAt: "2027-11-07T05:30:01Z",
      cancelledReason: null,
      history: [],
    },
  ];
  const open = vi.fn();
  const node = (v: TaskProgressView) => (
    <I18nextProvider i18n={testI18n()}>
      <ReminderList view={v} onOpen={open} />
    </I18nextProvider>
  );
  const mounted = render(node(v));
  fireEvent.click(screen.getByRole("button", { name: "Open task" }));
  expect(open).toHaveBeenCalledWith("sanity:1", "Same id content");
  mounted.rerender(node({ ...v, stale: true }));
  expect(screen.queryByText("Due now")).toBeNull();
  expect(screen.queryByRole("button", { name: "Open task" })).toBeNull();
});
