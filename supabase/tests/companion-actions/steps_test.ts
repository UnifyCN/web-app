// Task steps (mobile-app#366) through the public request boundary, against a real local
// Postgres + GoTrue + PostgREST + edge runtime. One level of steps under one parent
// Checklist task, with the common revision, receipt, lookup and Undo rules. Each test
// names the observation that would prove the behavior wrong.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import {
  apply, approved, cancel, confirmedRemoval, contentStub, conversationActions, conversationWith, existingCustomTask,
  existingSanityTask, holdOperationLock, newAccount, prepare, read, ready, revise, setState, sql, startContentStub,
  status, stepCreate, stepDone, stepRemove, stepRows, stepsOf, stepUpdate, taskOf, testOpts, undo, uuid,
  waitForBlocked,
} from './support.ts';

await ready();
startContentStub();

const SIN = 'sin-number';
const SIN_STEPS = ['Review the official requirements', 'Prepare the required documents', 'Submit the application yourself'];

async function addStep(who: Parameters<typeof apply>[0], ref: string, title: string) {
  const w = await apply(who, [stepCreate(ref, [title])]);
  assertEquals(w.status, 200, JSON.stringify(w.json));
  return w.json.receipt.steps[0] as { step_id: string; title: string; after_revision: number };
}

async function liveSteps(userId: string): Promise<number> {
  const [{ n }] = await sql`select count(*)::int n from companion_task_steps where user_id = ${userId} and removed_at is null`;
  return n;
}

Deno.test({
  name: 'a step added by its exact control is saved once under its parent, read back at once, and adds no main-list task',
  ...testOpts,
  fn: async () => {
    // Wrong if: the step is missing from an immediate read, it lands under another task,
    // the parent's state or revision moves, or a second Checklist task appears.
    const a = await newAccount('steps-add');
    const task = await existingCustomTask(a, 'Open a bank account');
    const before = await taskOf(a, task.ref);
    const w = await apply(a, [stepCreate(task.ref, ['Book a branch appointment'])]);
    assertEquals(w.status, 200, JSON.stringify(w.json));
    const r = w.json.receipt;
    assertEquals([r.operation_type, r.task_ref, r.current, r.undoable], ['step.create', task.ref, true, true]);
    assertEquals(r.steps.length, 1);
    assertEquals([r.steps[0].title, r.steps[0].done], ['Book a branch appointment', false]);
    assert(/^[0-9a-f-]{36}$/.test(r.steps[0].step_id));

    const steps = await stepsOf(a, task.ref, 'web');
    assertEquals(steps.map(s => [s.step_id, s.title, s.done]), [[r.steps[0].step_id, 'Book a branch appointment', false]]);
    const after = await taskOf(a, task.ref);
    assertEquals([after.state, after.revision], [before.state, before.revision], 'adding a step changed the parent');
    // The task's last receipt is still about the task, not the step.
    assertEquals(after.last_receipt, before.last_receipt);
    const list = await a.client.from('custom_checklist_tasks').select('id');
    assertEquals(list.data?.length, 1, 'a step became a main-list task');
  },
});

Deno.test({
  name: 'a content-backed parent needs its published task: unknown, removed and failed reads write no step',
  ...testOpts,
  fn: async () => {
    // Wrong if: a step is saved under a content id that does not exist, under a removed
    // task, or while the content read failed (outcome then must not look saved).
    const a = await newAccount('steps-content');
    const ok = await apply(a, [stepCreate(`sanity:${SIN}`, ['Find your PR confirmation'])]);
    assertEquals(ok.status, 200, JSON.stringify(ok.json));
    // The parent row is not created or changed by adding a step.
    const [{ n: rows }] = await sql`select count(*)::int n from user_tasks where user_id = ${a.id}`;
    assertEquals(rows, 0);

    const unknown = await apply(a, [stepCreate('sanity:no-such-task', ['Anything'])]);
    assertEquals([unknown.status, unknown.json.reason], [404, 'task_not_found'], JSON.stringify(unknown.json));

    contentStub.fail = true;
    try {
      const failed = await apply(a, [stepCreate('sanity:bank-account', ['Bring two IDs'])]);
      assertEquals([failed.status, failed.json.error], [503, 'content_unavailable'], JSON.stringify(failed.json));
    } finally {
      contentStub.fail = false;
    }

    await a.client.from('user_tasks').upsert({ user_id: a.id, sanity_checklist_id: 'bank-account', dismissed_at: new Date().toISOString() },
      { onConflict: 'user_id,sanity_checklist_id' });
    const removed = await apply(a, [stepCreate('sanity:bank-account', ['Bring two IDs'])]);
    assertEquals([removed.status, removed.json.reason], [422, 'task_removed'], JSON.stringify(removed.json));
    assertEquals((await stepRows(a.id)).map(s => s.title), ['Find your PR confirmation']);
  },
});

Deno.test({
  name: 'no orphaned step: a failed parent creation, a missing or removed custom task and another account\'s task all write nothing',
  ...testOpts,
  fn: async () => {
    // Wrong if: any step row exists for a parent that is not this account's live task.
    const a = await newAccount('steps-orphan');
    const b = await newAccount('steps-orphan-b');
    // A task creation that failed: its id was taken, its row rolled back.
    let failedId = 0;
    await sql.begin(async t => {
      const [row] = await t`insert into custom_checklist_tasks (user_id, title, description, priority)
        values (${a.id}, 'Rolled back', '', 'Do soon') returning id`;
      failedId = Number(row.id);
      throw new Error('rollback');
    }).catch(() => {});
    assert(failedId > 0);
    const orphan = await apply(a, [stepCreate(`custom:${failedId}`, ['Never saved'])]);
    assertEquals([orphan.status, orphan.json.reason], [404, 'task_not_found'], JSON.stringify(orphan.json));

    const theirs = await existingCustomTask(b, 'B private task');
    const cross = await apply(a, [stepCreate(theirs.ref, ['Not mine'])]);
    assertEquals([cross.status, cross.json.reason], [404, 'task_not_found'], JSON.stringify(cross.json));
    const crossPrepare = await prepare(a, stepCreate(theirs.ref, ['Not mine']));
    assertEquals(crossPrepare.status, 404, JSON.stringify(crossPrepare.json));

    // A custom task removed by the legacy client (hard delete) or by Undo of its creation.
    const gone = await existingCustomTask(a, 'Deleted by old app');
    await a.client.from('custom_checklist_tasks').delete().eq('id', gone.id);
    const deleted = await apply(a, [stepCreate(gone.ref, ['Too late'])]);
    assertEquals(deleted.status, 404, JSON.stringify(deleted.json));

    assertEquals(await stepRows(a.id), []);
    assertEquals(await stepRows(b.id), []);
  },
});

Deno.test({
  name: 'one level only and exact authorization: nested parents, unknown fields, multi-title controls and forged evidence are refused',
  ...testOpts,
  fn: async () => {
    // Wrong if: a step can be the parent of a step, a direct control adds more than the one
    // typed step, a restore or a removal runs without its required evidence, or a
    // model-style approval flag authorizes anything.
    const a = await newAccount('steps-shape');
    const task = await existingCustomTask(a, 'Get a phone plan');
    const step = await addStep(a, task.ref, 'Compare plans');

    const nested = await apply(a, [stepCreate(`step:${step.step_id}`, ['Sub-step'])]);
    assertEquals([nested.status, nested.json.reason], [422, 'invalid_task_ref']);
    const parentField = await apply(a, [{ ...stepCreate(task.ref, ['Sub-step']), parent_step_id: step.step_id }]);
    assertEquals([parentField.status, parentField.json.reason], [422, 'unknown_field']);
    const many = await apply(a, [stepCreate(task.ref, ['One', 'Two'])]);
    assertEquals([many.status, many.json.reason], [403, 'invalid_authorization']);
    const forged = await apply(a, [stepCreate(task.ref, ['Forged'])], { authorization: { kind: 'model', approved: true } });
    assertEquals(forged.status, 403);
    const restore = await apply(a, [{ type: 'step.restore', step_id: step.step_id, expected_revision: 1 }]);
    assertEquals(restore.status, 403, JSON.stringify(restore.json));
    const blank = await apply(a, [stepCreate(task.ref, ['  '])]);
    assertEquals([blank.status, blank.json.reason], [422, 'invalid_title']);
    const command = await apply(a, [stepCreate(task.ref, ['By command'])], { authorization: { kind: 'direct_command', message_id: 1 } });
    assertEquals(command.status, 403);
    assertEquals((await stepRows(a.id)).map(s => s.title), ['Compare plans']);
  },
});

Deno.test({
  name: 'repeated and concurrent sends of one step intent save one step; a lost reply is looked up; a reused id with another payload is refused',
  ...testOpts,
  fn: async () => {
    // Wrong if: two steps are saved, the lookup claims not-applied after commit, pending is
    // reported as settled, or one id can carry a different step.
    const a = await newAccount('steps-retry');
    const task = await existingCustomTask(a, 'Get a SIN');
    const operation_id = uuid();
    const replies = await Promise.all(Array.from({ length: 6 }, () =>
      apply(a, [stepCreate(task.ref, ['Find your passport'])], { operation_id })));
    assertEquals(replies.map(r => r.status), [200, 200, 200, 200, 200, 200], JSON.stringify(replies.map(r => r.json)));
    assertEquals(replies.filter(r => r.json.replayed === false).length, 1);
    assertEquals(new Set(replies.map(r => r.json.receipt.steps[0].step_id)).size, 1);
    assertEquals(await liveSteps(a.id), 1);

    const lost = await status(a, operation_id);
    assertEquals([lost.json.status, lost.json.receipt.steps[0].title], ['applied', 'Find your passport']);
    const reused = await apply(a, [stepCreate(task.ref, ['Something else'])], { operation_id });
    assertEquals([reused.status, reused.json.error], [409, 'operation_id_reused']);

    const held = uuid();
    const lock = holdOperationLock(a.id, held);
    await lock.ready;
    const pending = await status(a, held);
    assertEquals(pending.json.status, 'pending');
    await lock.release();
    assertEquals((await status(a, held)).json.status, 'not_applied');
    const retry = await apply(a, [stepCreate(task.ref, ['Copy your study permit'])], { operation_id: held });
    assertEquals([retry.status, retry.json.replayed], [200, false]);
    assertEquals(await liveSteps(a.id), 2);
  },
});

Deno.test({
  name: 'edits are revision-checked: a stale edit and the loser of two competing edits change nothing',
  ...testOpts,
  fn: async () => {
    // Wrong if: an edit naming an old revision overwrites the step, or both of two
    // simultaneous edits of the same revision report success.
    const a = await newAccount('steps-edit');
    const task = await existingCustomTask(a, 'Open a bank account');
    const s = await addStep(a, task.ref, 'Book appointment');
    const first = await apply(a, [stepUpdate(s.step_id, 'Book a branch appointment', s.after_revision)]);
    assertEquals(first.status, 200, JSON.stringify(first.json));
    const stale = await apply(a, [stepUpdate(s.step_id, 'Old view edit', s.after_revision)]);
    assertEquals([stale.status, stale.json.error], [409, 'revision_conflict'], JSON.stringify(stale.json));

    const rev = first.json.receipt.steps[0].after_revision;
    const racing = await Promise.all([
      apply(a, [stepUpdate(s.step_id, 'Edit from phone', rev)], { platform: 'ios' }),
      apply(a, [stepUpdate(s.step_id, 'Edit from web', rev)], { platform: 'web' }),
    ]);
    assertEquals(racing.map(r => r.status).sort(), [200, 409], JSON.stringify(racing.map(r => r.json)));
    const winner = racing.find(r => r.status === 200)!.json.receipt.steps[0].title;
    assertEquals((await stepsOf(a, task.ref)).map(x => x.title), [winner]);
  },
});

Deno.test({
  name: 'checking every step leaves the parent unchanged; explicit completion keeps done and unfinished steps and stops reminders atomically',
  ...testOpts,
  fn: async () => {
    // Wrong if: the parent completes or moves revision when all steps are checked; the
    // completion marks an unfinished step done, removes a step, or leaves a pending
    // reminder; reopen or Undo restarts the stopped reminder; steps change on a completed task.
    const a = await newAccount('steps-complete');
    const ref = await existingSanityTask(a, SIN);
    const created = await apply(a, [stepCreate(ref, [SIN_STEPS[0]])]);
    const s1 = created.json.receipt.steps[0];
    const s2 = await addStep(a, ref, SIN_STEPS[1]);
    const s3 = await addStep(a, ref, SIN_STEPS[2]);
    const t0 = await taskOf(a, ref);
    for (const s of [s1, s2, s3]) {
      const d = await apply(a, [stepDone(s.step_id, true, s.after_revision)]);
      assertEquals(d.status, 200, JSON.stringify(d.json));
    }
    const allDone = await taskOf(a, ref);
    assertEquals([allDone.state, allDone.revision], [t0.state, t0.revision], 'checking every step changed the parent');

    // Untick one so completion happens with an unfinished step.
    const [cur3] = (await stepsOf(a, ref)).filter(s => s.step_id === s3.step_id);
    const undone = await apply(a, [stepDone(s3.step_id, false, cur3.revision)]);
    assertEquals(undone.status, 200);
    const [rem] = await sql`insert into companion_task_reminders (user_id, task_ref, remind_at, time_zone)
      values (${a.id}, ${ref}, now() + interval '2 days', 'America/Vancouver') returning id`;

    const complete = await apply(a, [setState(ref, 'completed', allDone.revision)]);
    assertEquals(complete.status, 200, JSON.stringify(complete.json));
    assertEquals(complete.json.receipt.after_state, 'completed');
    assertEquals([complete.json.receipt.steps_done, complete.json.receipt.steps_total], [2, 3]);
    const [r1] = await sql`select status, cancelled_reason from companion_task_reminders where id = ${rem.id}`;
    assertEquals([r1.status, r1.cancelled_reason], ['cancelled', 'task_completed']);
    assertEquals((await stepsOf(a, ref)).map(s => [s.title, s.done]),
      [[SIN_STEPS[0], true], [SIN_STEPS[1], true], [SIN_STEPS[2], false]]);

    const blocked = await apply(a, [stepDone(s3.step_id, true, (await stepsOf(a, ref))[2].revision)]);
    assertEquals([blocked.status, blocked.json.reason], [422, 'task_completed'], JSON.stringify(blocked.json));
    const blockedAdd = await apply(a, [stepCreate(ref, ['Late step'])]);
    assertEquals([blockedAdd.status, blockedAdd.json.reason], [422, 'task_completed']);

    const reopen = await undo(a, complete.json.operation_id);
    assertEquals(reopen.status, 200, JSON.stringify(reopen.json));
    assertEquals((await taskOf(a, ref)).state, 'not_started');
    const [r2] = await sql`select status from companion_task_reminders where id = ${rem.id}`;
    assertEquals(r2.status, 'cancelled', 'Undo of completion restarted a stopped reminder');
    assertEquals((await stepsOf(a, ref)).map(s => s.done), [true, true, false]);
    // The completion receipt keeps what was true when it was saved.
    const hist = await status(a, complete.json.operation_id);
    assertEquals([hist.json.receipt.steps_done, hist.json.receipt.steps_total, hist.json.receipt.current], [2, 3, false]);
  },
});

Deno.test({
  name: 'removal needs confirmation; Undo restores the step unless it changed; the removal receipt keeps its title',
  ...testOpts,
  fn: async () => {
    // Wrong if: a removal without confirmation removes, a retried removal acts twice, the
    // removed step still reads as live, Undo does not bring it back, or two Undo requests both apply.
    const a = await newAccount('steps-remove');
    const task = await existingCustomTask(a, 'Get a phone plan');
    const s = await addStep(a, task.ref, 'Compare carriers');
    const unconfirmed = await apply(a, [stepRemove(s.step_id, s.after_revision)]);
    assertEquals([unconfirmed.status, unconfirmed.json.reason], [403, 'removal_requires_confirmation']);
    assertEquals(await liveSteps(a.id), 1);

    const operation_id = uuid();
    const removed = await apply(a, [stepRemove(s.step_id, s.after_revision)], { operation_id, authorization: confirmedRemoval });
    assertEquals(removed.status, 200, JSON.stringify(removed.json));
    const again = await apply(a, [stepRemove(s.step_id, s.after_revision)], { operation_id, authorization: confirmedRemoval });
    assertEquals([again.status, again.json.replayed], [200, true]);
    assertEquals(removed.json.receipt.steps[0].title, 'Compare carriers');
    assertEquals(await stepsOf(a, task.ref), []);
    assertEquals((await stepRows(a.id)).map(r => r.removed), [true], 'removal must keep the history row');

    const [u1, u2] = await Promise.all([undo(a, removed.json.operation_id), undo(a, removed.json.operation_id)]);
    assertEquals([u1.status, u2.status].sort(), [200, 409], JSON.stringify([u1.json, u2.json]));
    assertEquals([u1, u2].find(r => r.status === 409)!.json.error, 'already_undone');
    assertEquals((await stepsOf(a, task.ref)).map(x => x.title), ['Compare carriers']);
  },
});

Deno.test({
  name: 'Undo of an old step receipt never overwrites a newer edit: it offers a reviewed change instead',
  ...testOpts,
  fn: async () => {
    // Wrong if: Undo of the first rename overwrites the second, or the offered change
    // applies without approval.
    const a = await newAccount('steps-undo');
    const task = await existingCustomTask(a, 'Open a bank account');
    const s = await addStep(a, task.ref, 'Bring ID');
    const e1 = await apply(a, [stepUpdate(s.step_id, 'Bring two IDs', s.after_revision)]);
    const e2 = await apply(a, [stepUpdate(s.step_id, 'Bring passport and PR card', e1.json.receipt.steps[0].after_revision)]);
    assertEquals(e2.status, 200);
    const u = await undo(a, e1.json.operation_id);
    assertEquals([u.status, u.json.error], [409, 'undo_conflict'], JSON.stringify(u.json));
    assertEquals((await stepsOf(a, task.ref))[0].title, 'Bring passport and PR card');
    const proposal = u.json.proposal;
    assertEquals(proposal.operations[0].type, 'step.update');
    assertEquals(proposal.operations[0].title, 'Bring ID');
    const unapproved = await apply(a, proposal.operations);
    assertEquals(unapproved.status, 200, 'a direct edit with the same content is the user\'s own control');
    // The reviewed change is now stale (the step moved): its approval writes nothing.
    const stale = await apply(a, proposal.operations, { authorization: approved(proposal) });
    assertEquals(stale.status, 409, JSON.stringify(stale.json));
  },
});

Deno.test({
  name: 'Undo of an added step removes it only with confirmation; a historical receipt keeps the saved title and done state',
  ...testOpts,
  fn: async () => {
    // Wrong if: Undo of an add removes without confirmation, or a later rename/check
    // rewrites what the add receipt says was saved.
    const a = await newAccount('steps-history');
    const task = await existingCustomTask(a, 'Get a SIN');
    const add = await apply(a, [stepCreate(task.ref, ['Find PR confirmation'])]);
    const s = add.json.receipt.steps[0];
    const ren = await apply(a, [stepUpdate(s.step_id, 'Find COPR letter', s.after_revision)]);
    await apply(a, [stepDone(s.step_id, true, ren.json.receipt.steps[0].after_revision)]);

    const hist = await status(a, add.json.operation_id);
    assertEquals([hist.json.receipt.steps[0].title, hist.json.receipt.steps[0].done, hist.json.receipt.current],
      ['Find PR confirmation', false, false]);
    const renHist = await status(a, ren.json.operation_id);
    assertEquals([renHist.json.receipt.steps[0].before_title, renHist.json.receipt.steps[0].title],
      ['Find PR confirmation', 'Find COPR letter']);

    const noConfirm = await undo(a, add.json.operation_id);
    assertEquals([noConfirm.status, noConfirm.json.reason], [403, 'removal_requires_confirmation']);
    // The step changed after it was added: nothing is removed, a reviewed removal is offered.
    const conflict = await undo(a, add.json.operation_id, { authorization: confirmedRemoval });
    assertEquals([conflict.status, conflict.json.error], [409, 'undo_conflict'], JSON.stringify(conflict.json));
    const op = conflict.json.proposal.operations[0];
    assertEquals(op.type, 'step.remove_created');
    const noConfirmApply = await apply(a, [op], { authorization: approved(conflict.json.proposal) });
    assertEquals(noConfirmApply.status, 403);
    const ok = await apply(a, [op], { authorization: { ...approved(conflict.json.proposal), removal_confirmed: true } });
    assertEquals(ok.status, 200, JSON.stringify(ok.json));
    assertEquals(await stepsOf(a, task.ref), []);

    // An unchanged added step: Undo with confirmation removes it directly.
    const add2 = await apply(a, [stepCreate(task.ref, ['Book an appointment'])]);
    const u = await undo(a, add2.json.operation_id, { authorization: confirmedRemoval });
    assertEquals(u.status, 200, JSON.stringify(u.json));
    assertEquals(await stepsOf(a, task.ref), []);
  },
});

Deno.test({
  name: 'suggested steps are a draft until approved; the approved revision adds exactly its steps once, in order',
  ...testOpts,
  fn: async () => {
    // Wrong if: preparing writes a step, an old revision applies after an edit, a cancelled
    // draft writes, repeated approval adds steps twice, or another conversation cannot see it.
    const a = await newAccount('steps-propose');
    const ref = await existingSanityTask(a, SIN);
    const { conversation_id, message_id } = await conversationWith(a, 'assistant', 'Here is how to get your SIN.');
    const p = await prepare(a, stepCreate(ref, SIN_STEPS), { source: { conversation_id, message_id } });
    assertEquals(p.status, 200, JSON.stringify(p.json));
    const draft = p.json.proposal;
    assertEquals([draft.kind, draft.status, draft.proposal_revision], ['step_create', 'draft', 1]);
    assertEquals(draft.operations, [stepCreate(ref, SIN_STEPS)]);
    assertEquals(draft.context.existing_steps, []);
    assertEquals(await stepRows(a.id), [], 'preparing wrote a step');

    const listed = await conversationActions(a, conversation_id);
    assertEquals(listed.status, 200, JSON.stringify(listed.json));
    assertEquals(listed.json.proposals.map((x: { proposal_id: string }) => x.proposal_id), [draft.proposal_id]);

    const edited = await revise(a, draft.proposal_id, 1, stepCreate(ref, SIN_STEPS.slice(0, 2)));
    assertEquals([edited.status, edited.json.proposal.proposal_revision], [200, 2]);
    const stale = await apply(a, draft.operations, { authorization: approved(draft) });
    assertEquals(stale.status, 403);
    const retarget = await revise(a, draft.proposal_id, 2, stepCreate('sanity:bank-account', ['Other']));
    assertEquals(retarget.status, 422, 'a draft cannot move its steps to another task');

    const ops = edited.json.proposal.operations;
    const operation_id = uuid();
    const [w1, w2] = await Promise.all([
      apply(a, ops, { operation_id, authorization: approved(edited.json.proposal) }),
      apply(a, ops, { operation_id, authorization: approved(edited.json.proposal) }),
    ]);
    assertEquals([w1.status, w2.status], [200, 200], JSON.stringify([w1.json, w2.json]));
    assertEquals((await stepsOf(a, ref, 'web')).map(s => s.title), SIN_STEPS.slice(0, 2));

    const p2 = await prepare(a, stepCreate(ref, ['Keep a copy of your SIN letter']));
    const c = await cancel(a, p2.json.proposal.proposal_id, 1);
    assertEquals(c.status, 200);
    const afterCancel = await apply(a, p2.json.proposal.operations, { authorization: approved(p2.json.proposal) });
    assertEquals(afterCancel.status, 403);
    assertEquals((await stepsOf(a, ref)).length, 2);
  },
});

Deno.test({
  name: 'a relevant change since review needs a new approval; a removed or completed parent refuses the draft',
  ...testOpts,
  fn: async () => {
    // Wrong if: an approval reviewed before a same-title step appeared still writes, an
    // unrelated check of another step forces review, or a draft adds steps under a
    // task that was completed or removed after review.
    const a = await newAccount('steps-context');
    const task = await existingCustomTask(a, 'Open a bank account');
    const other = await addStep(a, task.ref, 'Choose a bank');
    const d = (await prepare(a, stepCreate(task.ref, ['Bring two IDs']))).json.proposal;
    // Unrelated: checking an existing step.
    await apply(a, [stepDone(other.step_id, true, other.after_revision)]);
    const d2 = (await prepare(a, stepCreate(task.ref, ['Ask about newcomer fees']))).json.proposal;
    await addStep(a, task.ref, 'Ask about newcomer fees');
    const review = await apply(a, d2.operations, { authorization: approved(d2) });
    assertEquals([review.status, review.json.error], [409, 'needs_review'], JSON.stringify(review.json));
    assertEquals(review.json.proposal.proposal_revision, 2);
    assertEquals((await stepsOf(a, task.ref)).filter(s => s.title === 'Ask about newcomer fees').length, 1);

    const ok = await apply(a, d.operations, { authorization: approved(d) });
    assertEquals(ok.status, 200, JSON.stringify(ok.json));

    const d3 = (await prepare(a, stepCreate(task.ref, ['Set up online banking']))).json.proposal;
    const t = await taskOf(a, task.ref);
    await apply(a, [setState(task.ref, 'completed', t.revision)]);
    const late = await apply(a, d3.operations, { authorization: approved(d3) });
    assertEquals([late.status, late.json.reason], [422, 'task_completed'], JSON.stringify(late.json));
    assertEquals((await stepsOf(a, task.ref)).some(s => s.title === 'Set up online banking'), false);
  },
});

Deno.test({
  name: 'another account cannot read, change, look up or undo my steps',
  ...testOpts,
  fn: async () => {
    // Wrong if: B sees A's step, changes it, learns its receipt, or reverses it.
    const a = await newAccount('steps-iso-a');
    const b = await newAccount('steps-iso-b');
    const task = await existingCustomTask(a, 'A private task');
    const add = await apply(a, [stepCreate(task.ref, ['A private step'])]);
    const s = add.json.receipt.steps[0];
    const bRead = await read(b);
    assertEquals(bRead.json.steps, []);
    const edit = await apply(b, [stepUpdate(s.step_id, 'Changed by B', s.after_revision)]);
    assertEquals([edit.status, edit.json.reason], [404, 'step_not_found']);
    const done = await apply(b, [stepDone(s.step_id, true, s.after_revision)]);
    assertEquals(done.status, 404);
    const rm = await apply(b, [stepRemove(s.step_id, s.after_revision)], { authorization: confirmedRemoval });
    assertEquals(rm.status, 404);
    assertEquals((await status(b, add.json.operation_id)).json.status, 'not_applied');
    assertEquals((await undo(b, add.json.operation_id, { authorization: confirmedRemoval })).status, 404);
    // The legacy table path is read-only for steps and private.
    const direct = await b.client.from('companion_task_steps').select('id');
    assertEquals(direct.data, []);
    const write = await a.client.from('companion_task_steps').update({ title: 'x' }).eq('id', s.step_id).select('id');
    assert(write.error || (write.data ?? []).length === 0, 'a client wrote a step row directly');
    assertEquals((await stepsOf(a, task.ref)).map(x => [x.title, x.done]), [['A private step', false]]);
  },
});

Deno.test({
  name: 'step controls, lookup and Undo never touch the AI allowance',
  ...testOpts,
  fn: async () => {
    // Wrong if: any step action calls the generation quota (the tripwire records calls).
    const a = await newAccount('steps-quota');
    const task = await existingCustomTask(a, 'Get a phone plan');
    const [{ n: before }] = await sql`select count(*)::int n from quota_tripwire_calls`;
    const add = await apply(a, [stepCreate(task.ref, ['Compare plans'])]);
    await status(a, add.json.operation_id);
    const s = add.json.receipt.steps[0];
    const d = await apply(a, [stepDone(s.step_id, true, s.after_revision)]);
    await undo(a, d.json.operation_id);
    await prepare(a, stepCreate(task.ref, ['Port your number']));
    const [{ n: after }] = await sql`select count(*)::int n from quota_tripwire_calls`;
    assertEquals(after, before);
  },
});

Deno.test({
  name: 'while one step write holds a parent, a parent removal and a step write are ordered, never interleaved',
  ...testOpts,
  fn: async () => {
    // Wrong if: a step is saved under a task whose removal committed first.
    const a = await newAccount('steps-lock');
    const draft = (await prepare(a, { type: 'task.create_custom', title: 'Temporary task', priority: 'Do soon' })).json.proposal;
    const created = await apply(a, draft.operations, { authorization: approved(draft) });
    const ref = created.json.receipt.task_ref;
    const id = Number(ref.slice(7));
    let release!: () => void;
    const held = new Promise<void>(r => (release = r));
    let markReady!: () => void;
    const lockReady = new Promise<void>(r => (markReady = r));
    const holder = sql.begin(async t => {
      await t`select 1 from custom_checklist_tasks where id = ${id} for update`;
      markReady();
      await held;
    });
    await lockReady;
    const removal = undo(a, created.json.operation_id, { authorization: confirmedRemoval });
    const addStepP = apply(a, [stepCreate(ref, ['After removal?'])]);
    assertEquals(await waitForBlocked(2, '%companion_%'), 2, 'both writes must wait on the held parent');
    release();
    await holder;
    const [rm, st] = await Promise.all([removal, addStepP]);
    assertEquals(rm.status, 200, JSON.stringify(rm.json));
    if (st.status === 200) {
      // The step committed first: it is history of a task removed afterwards.
      assertEquals((await taskOf(a, ref)).removed, true);
    } else {
      assertEquals([st.status, st.json.reason], [422, 'task_removed'], JSON.stringify(st.json));
      assertEquals(await stepRows(a.id), []);
    }
  },
});
