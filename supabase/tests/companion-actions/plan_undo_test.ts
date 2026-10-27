// Undo of a plan approval (mobile-app#364) through the public request boundary against
// the real local stack. Undo targets one named plan receipt, removes only what that
// receipt added (with the user's confirmation), never reverses a later edit or another
// receipt, and offers a reviewed compensating change when newer work conflicts.
// Each test names the observation that would prove the behavior wrong.
import { assertEquals } from 'jsr:@std/assert@1';
import { draftFor, draftItems, PHONE, vancouverArrival } from './planSupport.ts';
import {
  apply, customRows, planApply, planRevise, planStatus, planUndo, plansOf, read, ready, setState, sql, testOpts, undo, uuid,
} from './support.ts';

await ready();

async function savedPlan(label: string) {
  const { a, sin, bank } = await vancouverArrival(label);
  const draft = await draftFor(a, sin, bank);
  const w = await planApply(a, draft);
  assertEquals(w.status, 200, JSON.stringify(w.json));
  const phone = w.json.receipt.results[2];
  return { a, sin, bank, draft, w, phone };
}

const revisions = async (a: Parameters<typeof read>[0], refs: string[]) => {
  const tasks = (await read(a)).json.tasks;
  return refs.map(r => tasks.find((t: { task_ref: string }) => t.task_ref === r)?.revision);
};

Deno.test({
  name: 'Undo of a plan asks for removal confirmation, then removes the plan and only the task it added',
  ...testOpts,
  fn: async () => {
    // Wrong if: Undo without confirmation removes anything; the reused SIN or bank task
    // changes; the plan stays in the entry; a replay or second Undo writes again.
    const { a, sin, bank, w, phone } = await savedPlan('oz');
    const before = await revisions(a, [sin, bank]);
    const unconfirmed = await planUndo(a, w.json.operation_id, { authorization: { kind: 'ui_control' } });
    assertEquals([unconfirmed.status, unconfirmed.json.reason], [403, 'removal_requires_confirmation'], JSON.stringify(unconfirmed.json));
    assertEquals((await customRows(a.id)).map(r => r.removed), [false]);

    const operation_id = uuid();
    const u = await planUndo(a, w.json.operation_id, { operation_id });
    assertEquals([u.status, u.json.status], [200, 'applied'], JSON.stringify(u.json));
    assertEquals(u.json.receipt.kind, 'plan_undo');
    assertEquals(u.json.receipt.results.map((r: { task_ref: string; outcome: string }) => [r.task_ref, r.outcome]),
      [[phone.task_ref, 'removed']]);
    assertEquals(u.json.receipt.results[0].title, PHONE);
    assertEquals((await customRows(a.id)).map(r => r.removed), [true]);
    assertEquals(await revisions(a, [sin, bank]), before);
    assertEquals((await plansOf(a)).json.plans, []);

    const replay = await planUndo(a, w.json.operation_id, { operation_id });
    assertEquals([replay.status, replay.json.replayed], [200, true]);
    const again = await planUndo(a, w.json.operation_id);
    assertEquals([again.status, again.json.error], [409, 'already_undone']);
    const original = await planStatus(a, w.json.operation_id);
    assertEquals([original.json.receipt.undone_by, original.json.receipt.undoable], [operation_id, false]);
    // The shared task Undo cannot reverse a plan receipt.
    const shared = await undo(a, w.json.operation_id, { authorization: { kind: 'ui_control', removal_confirmed: true } });
    assertEquals([shared.status, shared.json.reason], [422, 'not_undoable']);
  },
});

Deno.test({
  name: 'a plan that only reuses tasks is undone with a plain control and removes no task',
  ...testOpts,
  fn: async () => {
    // Wrong if: a confirmation is demanded for a change that removes no task, or a
    // reused task is touched.
    const { a, sin, bank } = await vancouverArrival('pia');
    const d = await draftFor(a, sin, bank);
    const v2 = (await planRevise(a, d.plan_proposal_id, 1, draftItems(d.items).map(i => i.kind === 'new' ? { ...i, include: false } : i))).json.plan_proposal;
    const w = await planApply(a, v2);
    const before = await revisions(a, [sin, bank]);
    const u = await planUndo(a, w.json.operation_id, { authorization: { kind: 'ui_control' } });
    assertEquals(u.status, 200, JSON.stringify(u.json));
    assertEquals(u.json.receipt.results, []);
    assertEquals(await revisions(a, [sin, bank]), before);
    assertEquals((await plansOf(a)).json.plans, []);
  },
});

Deno.test({
  name: 'Undo after a newer edit of the added task keeps the edit and offers a reviewed compensating change',
  ...testOpts,
  fn: async () => {
    // Wrong if: Undo removes the edited task or reverts its state, changes anything
    // before review, or the compensating change removes the edited task.
    const { a, w, phone } = await savedPlan('quin');
    const st = await apply(a, [setState(phone.task_ref, 'in_progress', phone.after_revision)]);
    assertEquals(st.status, 200, JSON.stringify(st.json));
    const u = await planUndo(a, w.json.operation_id);
    assertEquals([u.status, u.json.error], [409, 'undo_conflict'], JSON.stringify(u.json));
    assertEquals(u.json.current.map((c: { task_ref: string; state: string }) => [c.task_ref, c.state]), [[phone.task_ref, 'in_progress']]);
    const comp = u.json.plan_proposal;
    assertEquals([comp.kind, comp.status, comp.undo_of, comp.change_count], ['undo', 'draft', w.json.operation_id, 0]);
    assertEquals((await plansOf(a)).json.plans.length, 1, 'the conflicting Undo changed the plan');

    // Approving the compensating change removes the plan and keeps the edited task.
    const ok = await planApply(a, comp, { authorization: { kind: 'approved_proposal', proposal_id: comp.plan_proposal_id,
      proposal_revision: comp.proposal_revision } });
    assertEquals(ok.status, 200, JSON.stringify(ok.json));
    assertEquals(ok.json.receipt.results.map((r: { outcome: string }) => r.outcome), ['kept']);
    assertEquals((await plansOf(a)).json.plans, []);
    const tasks = (await read(a)).json.tasks;
    const t = tasks.find((x: { task_ref: string }) => x.task_ref === phone.task_ref);
    assertEquals([t.state, t.removed], ['in_progress', false]);
    assertEquals((await planUndo(a, w.json.operation_id)).json.error, 'already_undone');
  },
});

Deno.test({
  name: 'a plan Undo never reverses another receipt: an added task already undone on its own is left as it is',
  ...testOpts,
  fn: async () => {
    // Wrong if: the plan Undo fails because the task's own Undo ran first, or touches
    // that task again, or the task's own receipt can be undone twice.
    const { a, w, phone } = await savedPlan('rae');
    const own = await undo(a, phone.item_operation_id, { authorization: { kind: 'ui_control', removal_confirmed: true } });
    assertEquals(own.status, 200, JSON.stringify(own.json));
    const u = await planUndo(a, w.json.operation_id, { authorization: { kind: 'ui_control' } });
    assertEquals(u.status, 200, JSON.stringify(u.json));
    assertEquals(u.json.receipt.results.map((r: { outcome: string }) => r.outcome), ['already_removed']);
    assertEquals((await customRows(a.id)).map(r => r.removed), [true]);
    assertEquals((await plansOf(a)).json.plans, []);
  },
});

Deno.test({
  name: 'two plan Undos with different ids, sent together, reverse the receipt once',
  ...testOpts,
  fn: async () => {
    // Wrong if: both report a reversal, or either errors with 500.
    const { a, w } = await savedPlan('sal');
    const [x, y] = await Promise.all([planUndo(a, w.json.operation_id), planUndo(a, w.json.operation_id)]);
    assertEquals([x.status, y.status].sort(), [200, 409], JSON.stringify([x.json, y.json]));
    assertEquals((x.status === 409 ? x : y).json.error, 'already_undone');
    const [{ n }] = await sql`select count(*)::int n from companion_action_receipts where user_id = ${a.id} and undo_of = ${w.json.operation_id}`;
    assertEquals(n, 1);
  },
});

Deno.test({ name: 'cleanup', ...testOpts, fn: async () => { await sql.end(); } });
