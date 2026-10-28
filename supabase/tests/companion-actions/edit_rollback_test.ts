// Rollback of the task edit migration (mobile-app#365), alone and with the #363 and #361
// rollbacks, through the public request boundary. Edits already saved stay in the task's
// own columns (every Checklist reads them). Work only #365 understands is refused, never
// misapplied, while rolled back, and comes back on re-application without reusing an
// approval captured before the rollback. Each test names the observation that would
// prove the behavior wrong.
import { assertEquals } from 'jsr:@std/assert@1';
import {
  apply, approved, conversationWith, createTask, existingCustomTask, interpret, migrate, migrate365, newAccount,
  openGate, prepare, proposalOf, ready, setState, status, testOpts, undo,
} from './support.ts';

await ready();

type Account = Awaited<ReturnType<typeof newAccount>>;
async function row(who: Account, id: number) {
  const r = await who.client.from('custom_checklist_tasks').select('title, priority, revision').eq('id', id).single();
  if (r.error) throw r.error;
  return r.data;
}

async function editsInProgress(label: string) {
  await ready(); // each test starts from the full schema, whatever the last one left
  const a = await newAccount(label);
  const { ref, id } = await existingCustomTask(a, 'Get a phone plan');
  const p = (await prepare(a, { type: 'task.edit_details', task_ref: ref, title: 'Phone plan' })).json.proposal;
  const edited = await apply(a, p.operations, { authorization: approved(p) });
  assertEquals(edited.status, 200, JSON.stringify(edited.json));
  const draft = (await prepare(a, { type: 'task.edit_details', task_ref: ref, priority: 'Do now' })).json.proposal;
  const { message_id } = await conversationWith(a, 'user', 'Set description of task "Phone plan" to "Two carriers"');
  const i = await interpret(a, message_id);
  const cmd = await apply(a, [i.json.command.operation], { authorization: { kind: 'direct_command', message_id } });
  assertEquals(cmd.status, 200, JSON.stringify(cmd.json));
  return { a, ref, id, edited, draft, cmd };
}

Deno.test({
  name: 'rolling back only #365 keeps saved edits and #361/#363 controls, refuses edit work, and re-application restores it',
  ...testOpts,
  fn: async () => {
    // Wrong if: after the rollback a saved edit is lost, an edit's Undo or a pending edit
    // draft changes the task (or answers 500), state controls or task creation stop
    // working; or after re-applying, the Undo is lost, the old approval of the draft is
    // used, or the command's result cannot be looked up.
    const { a, ref, id, edited, draft, cmd } = await editsInProgress('ana');
    await migrate365('down');
    await openGate();
    assertEquals((await row(a, id)).title, 'Phone plan', 'the rollback lost a saved edit');
    const u = await undo(a, edited.json.operation_id);
    assertEquals([u.status, u.json.reason], [422, 'not_undoable'], JSON.stringify(u.json));
    const d = await apply(a, draft.operations, { authorization: approved(draft) });
    assertEquals(d.status === 403 || d.status === 422, true, `a rolled-back edit draft: ${d.status} ${JSON.stringify(d.json)}`);
    assertEquals((await row(a, id)).priority, 'Do soon');
    const state = await apply(a, [setState(ref, 'in_progress', (await row(a, id)).revision)]);
    assertEquals(state.status, 200, JSON.stringify(state.json));
    const created = (await prepare(a, createTask('Get a transit card'))).json.proposal;
    assertEquals((await apply(a, created.operations, { authorization: approved(created) })).status, 200);

    await migrate365('up');
    await openGate();
    const back = (await proposalOf(a, draft.proposal_id)).json.proposal;
    assertEquals([back.status, back.review_reason, back.proposal_revision], ['draft', 'restored', draft.proposal_revision + 1]);
    const old = await apply(a, draft.operations, { authorization: approved(draft) });
    assertEquals(old.status, 403, `the pre-rollback approval applied: ${JSON.stringify(old.json)}`);
    const looked = await status(a, cmd.json.operation_id);
    assertEquals([looked.json.status, looked.json.receipt.operation_type], ['applied', 'task.edit_details']);
    // The rename's Undo is back. The task moved on since, so it is offered for review.
    const again = await undo(a, edited.json.operation_id);
    assertEquals([again.status, again.json.error], [409, 'undo_conflict'], JSON.stringify(again.json));
    assertEquals(again.json.proposal.operations[0].title, 'Get a phone plan');
  },
});

Deno.test({
  name: 'a full rollback and re-application keeps saved edits and restores the edit receipts',
  ...testOpts,
  fn: async () => {
    // Wrong if: the full rollback loses the edited values, or after re-application an
    // edit receipt cannot be looked up or undone. Re-application moves every task to a
    // new revision (#361 rule), so the Undo is offered for review, not applied blind.
    const { a, id, edited, cmd } = await editsInProgress('bao');
    await migrate('down');
    const r = await a.client.from('custom_checklist_tasks').select('title, description').eq('id', id).single();
    assertEquals(r.data, { title: 'Phone plan', description: 'Two carriers' });
    await migrate('up');
    await openGate();
    assertEquals((await status(a, edited.json.operation_id)).json.receipt.changes,
      [{ field: 'title', before: 'Get a phone plan', after: 'Phone plan' }]);
    const u = await undo(a, cmd.json.operation_id);
    assertEquals([u.status, u.json.error], [409, 'undo_conflict'], JSON.stringify(u.json));
    assertEquals(u.json.proposal.operations[0].description, '');
    const ok = await apply(a, u.json.proposal.operations, { authorization: approved(u.json.proposal) });
    assertEquals(ok.status, 200, JSON.stringify(ok.json));
    const after = await a.client.from('custom_checklist_tasks').select('title, description').eq('id', id).single();
    assertEquals(after.data, { title: 'Phone plan', description: '' });
  },
});
