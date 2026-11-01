// Task removal (mobile-app#367) through the public request boundary against the real
// local stack. Every removal is a reviewed draft that names the task and its effects
// on plans, steps and reminders; only the approval of that exact revision with the
// user's confirmation removes it. Custom tasks are soft-removed (removed_at),
// content-backed tasks are dismissed (dismissed_at). Undo names the removal receipt,
// checks current revisions and never recreates work removed again or overwrites a
// newer edit. Each test names the observation that would prove the behavior wrong.
// Direct SQL is used only for fixtures (a pending reminder, lock holding) and for rows
// no public read exposes.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import {
  type Account, apply, approved, call, confirmedApproval, conversationActions, conversationWith, customRows,
  existingCustomTask, existingItem, existingSanityTask, holdOperationLock, holdParentLock, holdTaskRow, interpret,
  newAccount, pendingReminder, planApply, planPrepare, planUndo, plansOf, prepare, proposalOf, read, ready,
  reminderRow, setState, sql, status, stepCreate, stepDone, stepRows, stepsOf, taskOf, taskRemove, testOpts, undo,
  uuid, waitForBlocked,
} from './support.ts';

await ready();

const GOAL = 'Your first week in Vancouver';

/** A custom task with two steps (one done), in one saved plan, with one pending reminder. */
async function taskWithWork(label: string, title = 'Get a phone plan') {
  const a = await newAccount(label);
  const { ref, id } = await existingCustomTask(a, title);
  const s1 = await apply(a, [stepCreate(ref, ['Compare plans'])]);
  assertEquals(s1.status, 200, JSON.stringify(s1.json));
  const s2 = await apply(a, [stepCreate(ref, ['Bring passport'])]);
  assertEquals(s2.status, 200, JSON.stringify(s2.json));
  const first = (await stepsOf(a, ref))[0];
  assertEquals((await apply(a, [stepDone(first.step_id, true, first.revision)])).status, 200);
  const planId = await savedPlanWith(a, [ref]);
  const reminder = await pendingReminder(a.id, ref);
  return { a, ref, id, title, planId, reminder };
}

async function savedPlanWith(a: Account, refs: string[], goal = GOAL): Promise<string> {
  const p = await planPrepare(a, goal, refs.map(r => existingItem(r)));
  assertEquals(p.status, 200, JSON.stringify(p.json));
  const w = await planApply(a, p.json.plan_proposal);
  assertEquals(w.status, 200, JSON.stringify(w.json));
  return w.json.receipt.plan_id as string;
}

async function review(a: Account, ref: string, expected = 0, extra: Record<string, unknown> = {}) {
  const r = await prepare(a, taskRemove(ref, expected), extra);
  assertEquals(r.status, 200, JSON.stringify(r.json));
  return r.json.proposal;
}

/** What the legacy Checklist reads for custom tasks (user JWT, RLS). */
async function legacyCustomIds(a: Account): Promise<number[]> {
  const r = await a.client.from('custom_checklist_tasks').select('id').order('id');
  if (r.error) throw r.error;
  return (r.data ?? []).map(x => x.id as number);
}

async function legacyDismissed(a: Account, sanityId: string): Promise<string | null | undefined> {
  const r = await a.client.from('user_tasks').select('dismissed_at').eq('sanity_checklist_id', sanityId).maybeSingle();
  if (r.error) throw r.error;
  return r.data ? (r.data.dismissed_at as string | null) : undefined;
}

const planItem = async (a: Account, planId: string, ref: string) => {
  const plan = (await plansOf(a)).json.plans.find((p: { plan_id: string }) => p.plan_id === planId);
  return plan?.items.find((i: { task_ref: string }) => i.task_ref === ref);
};

Deno.test({
  name: 'a removal review names the task and its effects on plans, steps and reminders, and writes nothing',
  ...testOpts,
  fn: async () => {
    // Wrong if: preparing the review removes or changes the task, its steps, its plan
    // reference or its reminder; the effects are missing or wrong; asking again makes a
    // second open review instead of returning the same one.
    const { a, ref, title, planId, reminder } = await taskWithWork('rv');
    const before = await taskOf(a, ref);
    const p = await review(a, ref, before.revision);
    assertEquals([p.kind, p.status, p.proposal_revision], ['task_remove', 'draft', 1]);
    assertEquals(p.operations, [taskRemove(ref, before.revision)]);
    assertEquals(p.context, {
      task_ref: ref, title, state: 'not_started', revision: before.revision, removed: false,
      plans: [{ plan_id: planId, goal: GOAL }], steps_total: 2, reminders_pending: 1,
    });
    const after = await taskOf(a, ref);
    assertEquals([after.revision, after.removed], [before.revision, false]);
    assertEquals((await legacyCustomIds(a)).length, 1);
    assertEquals((await stepsOf(a, ref)).length, 2);
    assertEquals((await planItem(a, planId, ref)).removed, false);
    assertEquals((await reminderRow(reminder)).status, 'pending');
    // The client may hold an older revision: the review is always prepared at the current one.
    const again = await review(a, ref, 0);
    assertEquals([again.proposal_id, again.proposal_revision], [p.proposal_id, 1]);
    const [{ n }] = await sql`select count(*)::int n from companion_proposals where user_id = ${a.id} and kind = 'task_remove'`;
    assertEquals(n, 1);
  },
});

Deno.test({
  name: 'a confirmed removal soft-removes a custom task, keeps steps and plan references, stops reminders; Undo restores',
  ...testOpts,
  fn: async () => {
    // Wrong if: the row is deleted; steps or the plan reference disappear; the reminder
    // stays pending or is restarted by Undo; old clients still see the removed task; the
    // receipt does not name the effects; the task can still be edited while removed;
    // Undo needs a removal confirmation, restores twice, or does not bring it back.
    const { a, ref, id, title, planId, reminder } = await taskWithWork('rm');
    const p = await review(a, ref);
    const operation_id = uuid();
    const w = await apply(a, p.operations, { operation_id, authorization: confirmedApproval(p) });
    assertEquals(w.status, 200, JSON.stringify(w.json));
    const receipt = w.json.receipt;
    assertEquals([receipt.operation_type, receipt.title, receipt.task_ref, receipt.undoable, receipt.current],
      ['task.remove', title, ref, true, true]);
    assertEquals([receipt.plans, receipt.steps_kept, receipt.reminders_stopped],
      [[{ plan_id: planId, goal: GOAL }], 2, 1]);
    assertEquals((await taskOf(a, ref)).removed, true);
    assertEquals(await legacyCustomIds(a), []);
    assertEquals(await customRows(a.id), [{ id, title, removed: true }]);
    assertEquals((await stepRows(a.id)).map(s => [s.title, s.completed, s.removed]),
      [['Compare plans', true, false], ['Bring passport', false, false]]);
    assertEquals((await planItem(a, planId, ref)).removed, true);
    assertEquals(await reminderRow(reminder), { status: 'cancelled', cancelled_reason: 'task_removed' });
    const edit = await apply(a, [setState(ref, 'in_progress', receipt.after_revision)]);
    assertEquals([edit.status, edit.json.reason], [422, 'task_removed']);
    const step = await apply(a, [stepCreate(ref, ['One more'])]);
    assertEquals([step.status, step.json.reason], [422, 'task_removed']);
    // The draft is applied and names its receipt (another device reads the same).
    const seen = (await proposalOf(a, p.proposal_id)).json.proposal;
    assertEquals([seen.status, seen.receipt.operation_id], ['applied', operation_id]);

    const undoId = uuid();
    const u = await undo(a, operation_id, { operation_id: undoId });
    assertEquals(u.status, 200, JSON.stringify(u.json));
    assertEquals([u.json.receipt.kind, u.json.receipt.operation_type, u.json.receipt.title], ['undo', 'task.restore', title]);
    assertEquals((await taskOf(a, ref)).removed, false);
    assertEquals(await legacyCustomIds(a), [id]);
    assertEquals((await stepsOf(a, ref)).map(s => [s.title, s.done]), [['Compare plans', true], ['Bring passport', false]]);
    assertEquals((await planItem(a, planId, ref)).removed, false);
    assertEquals((await reminderRow(reminder)).status, 'cancelled');
    const replay = await undo(a, operation_id, { operation_id: undoId });
    assertEquals([replay.status, replay.json.replayed], [200, true]);
    const twice = await undo(a, operation_id);
    assertEquals([twice.status, twice.json.error], [409, 'already_undone']);
    const original = await status(a, operation_id);
    assertEquals([original.json.receipt.undone_by, original.json.receipt.current], [undoId, false]);
  },
});

Deno.test({
  name: 'a content-backed task is removed by dismissal, also when it has no progress row, and Undo clears it',
  ...testOpts,
  fn: async () => {
    // Wrong if: the removal writes anything but the legacy dismissal, a task without a row
    // cannot be removed, or Undo leaves it dismissed.
    const a = await newAccount('ct');
    const fresh = 'sanity:bank-account';
    const p = await review(a, fresh);
    assertEquals([p.context.state, p.context.revision, p.context.title], ['not_started', 0, null]);
    const w = await apply(a, p.operations, { authorization: confirmedApproval(p) });
    assertEquals(w.status, 200, JSON.stringify(w.json));
    assert(await legacyDismissed(a, 'bank-account'));
    assertEquals((await taskOf(a, fresh)).removed, true);
    const u = await undo(a, w.json.operation_id);
    assertEquals(u.status, 200, JSON.stringify(u.json));
    assertEquals(await legacyDismissed(a, 'bank-account'), null);

    const sin = await existingSanityTask(a, 'sin-number');
    await apply(a, [setState(sin, 'waiting', 1, 'Waiting for the letter')]);
    const q = await review(a, sin);
    assertEquals([q.context.state, q.context.revision], ['waiting', 2]);
    const v = await apply(a, q.operations, { authorization: confirmedApproval(q) });
    assertEquals(v.status, 200, JSON.stringify(v.json));
    const t = await taskOf(a, sin);
    // Dismissal keeps the waiting detail (the #360 legacy mapping).
    assertEquals([t.removed, t.state, t.waiting_reason], [true, 'waiting', 'Waiting for the letter']);
  },
});

Deno.test({
  name: 'every removal needs the reviewed draft and the user\'s confirmation; no other evidence removes',
  ...testOpts,
  fn: async () => {
    // Wrong if: an unconfirmed approval, a direct control, a command, a model flag, a
    // stale revision or a draft for another task removes anything.
    const a = await newAccount('cf');
    const { ref } = await existingCustomTask(a, 'Get a phone plan');
    const other = await existingCustomTask(a, 'Buy a transit pass');
    const p = await review(a, ref, 1);
    const unconfirmed = await apply(a, p.operations, { authorization: approved(p) });
    assertEquals([unconfirmed.status, unconfirmed.json.reason], [403, 'removal_requires_confirmation']);
    const control = await apply(a, [taskRemove(ref, 1)], { authorization: { kind: 'ui_control', removal_confirmed: true } });
    assertEquals([control.status, control.json.reason], [403, 'invalid_authorization']);
    const { message_id } = await conversationWith(a, 'user', 'Remove task: Get a phone plan');
    const command = await apply(a, [taskRemove(ref, 1)], { authorization: { kind: 'direct_command', message_id } });
    assertEquals([command.status, command.json.reason], [403, 'invalid_authorization']);
    const model = await apply(a, [taskRemove(ref, 1)], { authorization: { kind: 'ui_control', approved: true } });
    assertEquals(model.status, 403);
    const swapped = await apply(a, [taskRemove(other.ref, 1)], { authorization: confirmedApproval(p) });
    assertEquals(swapped.status, 403, JSON.stringify(swapped.json));
    const stale = await apply(a, p.operations, { authorization: confirmedApproval({ ...p, proposal_revision: 2 }) });
    assertEquals(stale.status, 403);
    assertEquals((await customRows(a.id)).map(r => r.removed), [false, false]);
    // The same reviewed draft still works once confirmed.
    const ok = await apply(a, p.operations, { authorization: confirmedApproval(p) });
    assertEquals(ok.status, 200, JSON.stringify(ok.json));
    assertEquals((await customRows(a.id)).map(r => r.removed), [true, false]);
    // A removed task cannot be reviewed again.
    const again = await prepare(a, taskRemove(ref, 0));
    assertEquals([again.status, again.json.reason], [422, 'task_removed']);
  },
});

Deno.test({
  name: 'a relevant change between review and approval needs a new review; an unrelated change does not',
  ...testOpts,
  fn: async () => {
    // Wrong if: an approval removes after the reviewed effects changed (new step, state
    // change, the task saved into or out of a plan); or an unrelated change (a step
    // checked, another task, another account) forces a needless review.
    const { a, ref, planId } = await taskWithWork('rc');
    const other = await existingCustomTask(a, 'Buy a transit pass');
    const b = await newAccount('rc-b');
    await existingCustomTask(b, 'Get a phone plan');

    // Unrelated first: check the second step, edit another task, another account's task.
    const p = await review(a, ref);
    const second = (await stepsOf(a, ref))[1];
    assertEquals((await apply(a, [stepDone(second.step_id, true, second.revision)])).status, 200);
    assertEquals((await apply(a, [setState(other.ref, 'in_progress', 1)])).status, 200);
    const bt = (await read(b)).json.tasks[0];
    assertEquals((await apply(b, [setState(bt.task_ref, 'waiting', bt.revision)])).status, 200);
    // Relevant: a new step changes the step history the review named.
    assertEquals((await apply(a, [stepCreate(ref, ['Pick a carrier'])])).status, 200);
    const r1 = await apply(a, p.operations, { authorization: confirmedApproval(p) });
    assertEquals([r1.status, r1.json.error], [409, 'needs_review'], JSON.stringify(r1.json));
    const v2 = r1.json.proposal;
    assertEquals([v2.proposal_revision, v2.review_reason, v2.previous_context.steps_total, v2.context.steps_total],
      [2, 'context_changed', 2, 3]);
    assertEquals((await taskOf(a, ref)).removed, false);
    // The old approval cannot be used again.
    const old = await apply(a, p.operations, { authorization: confirmedApproval(p) });
    assertEquals(old.status, 403);

    // Relevant: a state change moves the task revision; the revised draft binds the new one.
    const t = await taskOf(a, ref);
    assertEquals((await apply(a, [setState(ref, 'in_progress', t.revision)])).status, 200);
    const r2 = await apply(a, v2.operations, { authorization: confirmedApproval(v2) });
    assertEquals([r2.status, r2.json.error], [409, 'needs_review']);
    const v3 = r2.json.proposal;
    assertEquals([v3.context.state, v3.operations[0].expected_revision], ['in_progress', t.revision + 1]);

    // Relevant: the task joins another plan, then a plan that holds it is undone.
    const plan2 = await savedPlanWith(a, [ref], 'Week two');
    const r3 = await apply(a, v3.operations, { authorization: confirmedApproval(v3) });
    assertEquals([r3.status, r3.json.error], [409, 'needs_review']);
    const v4 = r3.json.proposal;
    assertEquals(v4.context.plans.map((x: { plan_id: string }) => x.plan_id).sort(), [planId, plan2].sort());
    const plan2Receipt = (await plansOf(a)).json.plans.find((x: { plan_id: string }) => x.plan_id === plan2).receipt;
    assertEquals((await planUndo(a, plan2Receipt.operation_id)).status, 200);
    const r4 = await apply(a, v4.operations, { authorization: confirmedApproval(v4) });
    assertEquals([r4.status, r4.json.error], [409, 'needs_review']);
    const v5 = r4.json.proposal;
    assertEquals(v5.context.plans, [{ plan_id: planId, goal: GOAL }]);
    const ok = await apply(a, v5.operations, { authorization: confirmedApproval(v5) });
    assertEquals(ok.status, 200, JSON.stringify(ok.json));
    assertEquals([ok.json.receipt.steps_kept, ok.json.receipt.plans.length], [3, 1]);
  },
});

Deno.test({
  name: 'an edit committed while the approval waits is read and needs review; an approval that holds the task first wins',
  ...testOpts,
  fn: async () => {
    // Wrong if: an approval that waited on the task removes it after a state change was
    // committed and read; or an edit/step add queued behind a removal writes to it.
    const a = await newAccount('cc');
    const { ref, id } = await existingCustomTask(a, 'Get a phone plan');
    const p = await review(a, ref, 1);
    // Order 1: the edit commits (and is read) while the approval waits for the task.
    const parent = holdParentLock(a.id, ref);
    await parent.ready;
    const waiting = apply(a, p.operations, { authorization: confirmedApproval(p) });
    assert(await waitForBlocked(1, '%companion_apply_actions%') >= 1);
    assertEquals((await apply(a, [setState(ref, 'waiting', 1, 'Store closed')])).status, 200);
    assertEquals((await taskOf(a, ref)).state, 'waiting');
    await parent.release();
    const late = await waiting;
    assertEquals([late.status, late.json.error], [409, 'needs_review'], JSON.stringify(late.json));
    assertEquals((await taskOf(a, ref)).removed, false);

    // Order 2: the approval holds the task first; an edit and a step add queued behind it are refused.
    const v2 = late.json.proposal;
    const row = holdTaskRow('custom_checklist_tasks', { column: 'id', value: id });
    await row.ready;
    const first = apply(a, v2.operations, { authorization: confirmedApproval(v2) });
    assert(await waitForBlocked(1, '%companion_apply_actions%') >= 1);
    const edit = apply(a, [setState(ref, 'in_progress', v2.operations[0].expected_revision)]);
    const stepAdd = apply(a, [stepCreate(ref, ['Late step'])]);
    assert(await waitForBlocked(3, '%companion_apply_actions%') >= 3);
    await row.release();
    const [w, e, s] = await Promise.all([first, edit, stepAdd]);
    assertEquals(w.status, 200, JSON.stringify(w.json));
    assertEquals([e.status, e.json.reason], [422, 'task_removed']);
    assertEquals([s.status, s.json.reason], [422, 'task_removed']);
    assertEquals(await stepRows(a.id), []);
  },
});

Deno.test({
  name: 'concurrent removal, edit and Undo: one outcome each, never a removed task that was edited after review',
  ...testOpts,
  fn: async () => {
    // Wrong if: duplicate taps record two removals; two approval ids both remove; a racing
    // edit and removal both write; two Undo requests restore twice.
    const a = await newAccount('cu');
    const { ref } = await existingCustomTask(a, 'Get a phone plan');
    const p = await review(a, ref, 1);
    // A race of the approval against an edit: exactly one of them writes.
    const [w, e] = await Promise.all([
      apply(a, p.operations, { authorization: confirmedApproval(p) }),
      apply(a, [setState(ref, 'in_progress', 1)]),
    ]);
    const t = await taskOf(a, ref);
    if (w.status === 200) {
      assertEquals([e.status, e.json.reason, t.removed, t.state], [422, 'task_removed', true, 'not_started']);
    } else {
      assertEquals([w.status, w.json.error, e.status, t.removed, t.state], [409, 'needs_review', 200, false, 'in_progress']);
    }

    const b = await newAccount('cu-b');
    const x = await existingCustomTask(b, 'Open a bank account');
    const q = await review(b, x.ref, 1);
    const operation_id = uuid();
    const taps = await Promise.all(Array.from({ length: 8 }, () =>
      apply(b, q.operations, { operation_id, authorization: confirmedApproval(q) })));
    assertEquals(taps.map(r => r.status), Array(8).fill(200));
    assertEquals(taps.filter(r => r.json.replayed === false).length, 1);
    const competing = await apply(b, q.operations, { authorization: confirmedApproval(q) });
    assertEquals(competing.status, 403);
    const [{ n }] = await sql`select count(*)::int n from companion_action_receipts
      where user_id = ${b.id} and outcome->'results'->0->>'type' = 'task.remove'`;
    assertEquals(n, 1);

    const undos = await Promise.all([undo(b, operation_id), undo(b, operation_id), undo(b, operation_id)]);
    assertEquals(undos.filter(u => u.status === 200).length, 1, JSON.stringify(undos.map(u => u.json)));
    assertEquals(undos.filter(u => u.status === 409 && u.json.error === 'already_undone').length, 2);
    assertEquals((await customRows(b.id)).map(r => r.removed), [false]);
  },
});

Deno.test({
  name: 'Undo keeps newer edits and never recreates a task that was restored or removed again elsewhere',
  ...testOpts,
  fn: async () => {
    // Wrong if: Undo writes after the task was restored elsewhere; undoing an older removal
    // brings back a task the user removed again later; a changed removed task is restored
    // without review; the reviewed restore overwrites the newer completion.
    const a = await newAccount('uk');
    const sin = await existingSanityTask(a, 'sin-number');
    const p = await review(a, sin);
    const r1 = await apply(a, p.operations, { authorization: confirmedApproval(p) });
    assertEquals(r1.status, 200);
    // Restored elsewhere by the legacy Checklist (an older app).
    const restore = await a.client.from('user_tasks').update({ dismissed_at: null }).eq('sanity_checklist_id', 'sin-number');
    assertEquals(restore.error, null);
    const live = await taskOf(a, sin);
    const blocked = await undo(a, r1.json.operation_id);
    assertEquals([blocked.status, blocked.json.error, blocked.json.reason, blocked.json.proposal],
      [409, 'undo_conflict', 'not_removed', null], JSON.stringify(blocked.json));
    assertEquals((await taskOf(a, sin)).revision, live.revision);

    // Removed again through a new review: the old receipt cannot bring it back.
    const q = await review(a, sin);
    const r2 = await apply(a, q.operations, { authorization: confirmedApproval(q) });
    assertEquals(r2.status, 200);
    const again = await undo(a, r1.json.operation_id);
    assertEquals([again.status, again.json.reason, again.json.proposal], [409, 'removed_again', null]);
    assertEquals((await taskOf(a, sin)).removed, true);

    // Same removal, newer edit: a legacy completion while dismissed. Undo offers a reviewed restore.
    const done = await a.client.from('user_tasks')
      .upsert({ user_id: a.id, sanity_checklist_id: 'sin-number', completed: true, completed_at: new Date().toISOString() },
        { onConflict: 'user_id,sanity_checklist_id' });
    assertEquals(done.error, null);
    const now = await taskOf(a, sin);
    const c = await undo(a, r2.json.operation_id);
    assertEquals([c.status, c.json.error, c.json.reason], [409, 'undo_conflict', 'changed'], JSON.stringify(c.json));
    assertEquals(c.json.proposal.operations, [{ type: 'task.restore', task_ref: sin, expected_revision: now.revision }]);
    assertEquals((await taskOf(a, sin)).removed, true);
    const ok = await apply(a, c.json.proposal.operations, { authorization: approved(c.json.proposal) });
    assertEquals(ok.status, 200, JSON.stringify(ok.json));
    const restored = await taskOf(a, sin);
    assertEquals([restored.removed, restored.state], [false, 'completed']);
    const twice = await undo(a, r2.json.operation_id);
    assertEquals([twice.status, twice.json.error], [409, 'already_undone']);
  },
});

Deno.test({
  name: 'Undo restores the task into plans that still exist and never brings back a plan removed separately',
  ...testOpts,
  fn: async () => {
    // Wrong if: the task's Undo restores a plan the user undid, or a kept plan loses it.
    const a = await newAccount('pl');
    const { ref } = await existingCustomTask(a, 'Get a phone plan');
    const kept = await savedPlanWith(a, [ref], 'Kept plan');
    const gone = await savedPlanWith(a, [ref], 'Undone plan');
    const p = await review(a, ref);
    const w = await apply(a, p.operations, { authorization: confirmedApproval(p) });
    assertEquals(w.status, 200);
    assertEquals(w.json.receipt.plans.map((x: { goal: string }) => x.goal).sort(), ['Kept plan', 'Undone plan']);
    const goneReceipt = (await plansOf(a)).json.plans.find((x: { plan_id: string }) => x.plan_id === gone).receipt;
    assertEquals((await planUndo(a, goneReceipt.operation_id)).status, 200);
    const u = await undo(a, w.json.operation_id);
    assertEquals(u.status, 200, JSON.stringify(u.json));
    const plans = (await plansOf(a)).json.plans;
    assertEquals(plans.map((x: { plan_id: string }) => x.plan_id), [kept]);
    assertEquals((await planItem(a, kept, ref)).removed, false);
  },
});

Deno.test({
  name: 'another account cannot review, approve, undo or look up a removal',
  ...testOpts,
  fn: async () => {
    // Wrong if: any request of account B reads or changes account A's task or receipt, or
    // B's removal of a shared content id touches A's row.
    const a = await newAccount('ia');
    const b = await newAccount('ib');
    const { ref } = await existingCustomTask(a, 'Get a phone plan');
    const sinA = await existingSanityTask(a, 'sin-number');
    const foreign = await prepare(b, taskRemove(ref, 1));
    assertEquals([foreign.status, foreign.json.reason], [404, 'task_not_found']);
    const p = await review(a, ref, 1);
    const readB = await proposalOf(b, p.proposal_id);
    assertEquals(readB.status, 404);
    const approveB = await apply(b, p.operations, { authorization: confirmedApproval(p) });
    assertEquals([approveB.status, approveB.json.reason], [403, 'invalid_authorization'], JSON.stringify(approveB.json));
    const w = await apply(a, p.operations, { authorization: confirmedApproval(p) });
    assertEquals(w.status, 200);
    assertEquals((await undo(b, w.json.operation_id)).status, 404);
    assertEquals((await status(b, w.json.operation_id)).json.status, 'not_applied');
    assertEquals((await read(b)).json.tasks, []);
    const qb = await review(b, sinA);
    assertEquals((await apply(b, qb.operations, { authorization: confirmedApproval(qb) })).status, 200);
    assertEquals(await legacyDismissed(a, 'sin-number'), null);
    assertEquals((await taskOf(a, sinA)).removed, false);
    assertEquals((await taskOf(a, ref)).removed, true);
  },
});

Deno.test({
  name: 'an unknown outcome is looked up before retry; a retry with the same identity removes once',
  ...testOpts,
  fn: async () => {
    // Wrong if: a lookup during a held write says not applied; a retry after a lost reply
    // writes again; one identity accepts another payload.
    const a = await newAccount('lk');
    const { ref } = await existingCustomTask(a, 'Get a phone plan');
    const p = await review(a, ref, 1);
    const operation_id = uuid();
    assertEquals((await status(a, operation_id)).json.status, 'not_applied');
    const held = holdOperationLock(a.id, operation_id);
    await held.ready;
    assertEquals((await status(a, operation_id)).json.status, 'pending');
    await held.release();
    // The reply is lost after commit: the client looks it up, then a retry replays.
    const w = await apply(a, p.operations, { operation_id, authorization: confirmedApproval(p) });
    assertEquals(w.status, 200);
    const s = await status(a, operation_id);
    assertEquals([s.json.status, s.json.receipt.operation_type], ['applied', 'task.remove']);
    const retry = await apply(a, p.operations, { operation_id, authorization: confirmedApproval(p) });
    assertEquals([retry.status, retry.json.replayed], [200, true]);
    const reused = await apply(a, [setState(ref, 'completed', 1)], { operation_id });
    assertEquals([reused.status, reused.json.error], [409, 'operation_id_reused']);
    const [{ n }] = await sql`select count(*)::int n from companion_action_receipts where user_id = ${a.id}
      and outcome->'results'->0->>'type' = 'task.remove'`;
    assertEquals(n, 1);
  },
});

Deno.test({
  name: 'old messages, receipts and drafts cannot recreate a removed task',
  ...testOpts,
  fn: async () => {
    // Wrong if: re-sending the old command, replaying its operation, or approving the old
    // draft adds the task again; the old receipt still reads as current.
    const a = await newAccount('old');
    const conv = await conversationWith(a, 'user', 'Add a task: Get a phone plan');
    const it = await interpret(a, conv.message_id);
    const createId = uuid();
    const added = await apply(a, [it.json.command.operation], {
      operation_id: createId, authorization: { kind: 'direct_command', message_id: conv.message_id },
    });
    assertEquals(added.status, 200);
    const ref = added.json.receipt.task_ref;
    const p = await review(a, ref, 1, { source: { conversation_id: conv.conversation_id, message_id: conv.message_id } });
    assertEquals((await apply(a, p.operations, { authorization: confirmedApproval(p) })).status, 200);

    const resend = await apply(a, [it.json.command.operation], { authorization: { kind: 'direct_command', message_id: conv.message_id } });
    assertEquals([resend.status, resend.json.error], [409, 'command_already_used']);
    const replay = await apply(a, [it.json.command.operation], {
      operation_id: createId, authorization: { kind: 'direct_command', message_id: conv.message_id },
    });
    assertEquals([replay.status, replay.json.replayed], [200, true]);
    assertEquals((await customRows(a.id)).map(r => r.removed), [true]);
    const actions = (await conversationActions(a, conv.conversation_id)).json;
    assertEquals(actions.commands[0].receipt.current, false);
    const draft = actions.proposals.find((x: { kind: string }) => x.kind === 'task_remove');
    assertEquals([draft.status, draft.receipt.operation_type], ['applied', 'task.remove']);
    // The removed task cannot be changed from the old create receipt either.
    const u = await undo(a, createId, { authorization: { kind: 'ui_control', removal_confirmed: true } });
    assertEquals([u.status, u.json.reason], [422, 'task_removed']);
  },
});

Deno.test({
  name: 'removal commands in every supported language ask for a review and never write',
  ...testOpts,
  fn: async () => {
    // Wrong if: a phrasing is not recognized, a bare command names no task but is treated
    // as one, or the command itself removes anything.
    const a = await newAccount('cmd');
    const phrasings: [string, string][] = [
      ['Remove task: Get a phone plan', 'Get a phone plan'],
      ['Delete task: Get a phone plan', 'Get a phone plan'],
      ['Remove Get a phone plan from my checklist', 'Get a phone plan'],
      ['Supprime la tâche : Forfait mobile', 'Forfait mobile'],
      ['Elimina la tarea: Plan de teléfono', 'Plan de teléfono'],
      ['Xóa việc: Gói điện thoại', 'Gói điện thoại'],
      ['कार्य हटाएँ: फ़ोन प्लान', 'फ़ोन प्लान'],
      ['ਕੰਮ ਹਟਾਓ: ਫ਼ੋਨ ਪਲਾਨ', 'ਫ਼ੋਨ ਪਲਾਨ'],
      ['احذف مهمة: خطة الهاتف', 'خطة الهاتف'],
    ];
    for (const [text, title] of phrasings) {
      const { message_id } = await conversationWith(a, 'user', text);
      const r = await interpret(a, message_id);
      assertEquals([r.status, r.json.command], [200, { kind: 'remove', title }], text);
    }
    const bare = await conversationWith(a, 'user', 'Remove task');
    assertEquals((await interpret(a, bare.message_id)).json.command, { kind: 'clarify', reason: 'missing_title', intent: 'remove' });
    const two = await conversationWith(a, 'user', 'Remove task: One\nRemove task: Two');
    assertEquals((await interpret(a, two.message_id)).json.command, { kind: 'clarify', reason: 'multiple', intent: 'remove' });
    const { ref } = await existingCustomTask(a, 'Get a phone plan');
    const { message_id } = await conversationWith(a, 'user', 'Remove task: Get a phone plan');
    const direct = await apply(a, [taskRemove(ref, 1)], { authorization: { kind: 'direct_command', message_id } });
    assertEquals(direct.status, 403);
    assertEquals((await customRows(a.id)).map(r => r.removed), [false]);
  },
});

Deno.test({
  name: 'legacy dismissal and account deletion keep their behavior',
  ...testOpts,
  fn: async () => {
    // Wrong if: a legacy dismissal is not seen as removed; a legacy hard delete fails;
    // deleting the account leaves any of its tasks, steps, receipts or drafts behind.
    const a = await newAccount('lg');
    await existingSanityTask(a, 'sin-number');
    const dismissed = await a.client.from('user_tasks').update({ dismissed_at: new Date().toISOString() })
      .eq('sanity_checklist_id', 'sin-number');
    assertEquals(dismissed.error, null);
    const r = await prepare(a, taskRemove('sanity:sin-number', 0));
    assertEquals([r.status, r.json.reason], [422, 'task_removed']);
    const hard = await existingCustomTask(a, 'Old custom');
    const del = await a.client.from('custom_checklist_tasks').delete().eq('id', hard.id);
    assertEquals(del.error, null);
    assertEquals(await customRows(a.id), []);

    const { a: b, ref } = await taskWithWork('lg-b');
    const p = await review(b, ref);
    assertEquals((await apply(b, p.operations, { authorization: confirmedApproval(p) })).status, 200);
    const gone = await b.client.rpc('delete_user');
    assertEquals(gone.error, null);
    const [left] = await sql`select
      (select count(*) from custom_checklist_tasks where user_id = ${b.id})::int tasks,
      (select count(*) from companion_task_steps where user_id = ${b.id})::int steps,
      (select count(*) from companion_action_receipts where user_id = ${b.id})::int receipts,
      (select count(*) from companion_proposals where user_id = ${b.id})::int drafts,
      (select count(*) from companion_task_reminders where user_id = ${b.id})::int reminders`;
    assertEquals(left, { tasks: 0, steps: 0, receipts: 0, drafts: 0, reminders: 0 });
  },
});

Deno.test({
  name: 'a removal review from a conversation is listed there and reads as removed on another device',
  ...testOpts,
  fn: async () => {
    // Wrong if: the conversation does not list its removal review; another device can
    // still approve an open review after the task was removed elsewhere.
    const a = await newAccount('cv');
    const { ref } = await existingCustomTask(a, 'Get a phone plan');
    const conv = await conversationWith(a, 'user', 'Remove task: Get a phone plan');
    const source = { conversation_id: conv.conversation_id, message_id: conv.message_id };
    const fromChat = await review(a, ref, 1, { source });
    const listed = (await conversationActions(a, conv.conversation_id)).json.proposals;
    assertEquals(listed.map((x: { proposal_id: string; kind: string }) => [x.proposal_id, x.kind]),
      [[fromChat.proposal_id, 'task_remove']]);
    // The panel review on another device is a separate draft.
    const panel = await review(a, ref, 1);
    assert(panel.proposal_id !== fromChat.proposal_id);
    assertEquals((await apply(a, panel.operations, { authorization: confirmedApproval(panel), platform: 'web' })).status, 200);
    const stale = await apply(a, fromChat.operations, { authorization: confirmedApproval(fromChat) });
    assertEquals([stale.status, stale.json.reason], [422, 'task_removed'], JSON.stringify(stale.json));
    const seen = (await proposalOf(a, fromChat.proposal_id)).json.proposal;
    assertEquals([seen.status, seen.context.removed], ['draft', false]);
    assertEquals((await taskOf(a, ref)).removed, true);
    assertEquals((await call(a, { contract_version: 1, client: { platform: 'ios', app_version: '1' }, action: 'read' })).status, 200);
  },
});
