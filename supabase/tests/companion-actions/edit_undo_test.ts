// Undo of a task edit (mobile-app#365) through the public request boundary. Undo names one
// receipt and restores the exact earlier values only while the task is still at the
// revision that receipt produced. After a newer edit nothing changes: the newer values are
// kept and a compensating change at the current revision is offered for review. Each test
// names the observation that would prove the behavior wrong.
import { assertEquals } from 'jsr:@std/assert@1';
import {
  apply, approved, conversationWith, existingCustomTask, interpret, newAccount, prepare, ready, setState,
  taskOf, testOpts, undo,
} from './support.ts';

await ready();

type Account = Awaited<ReturnType<typeof newAccount>>;
async function row(who: Account, id: number) {
  const r = await who.client.from('custom_checklist_tasks')
    .select('title, description, priority, completed, progress_state, waiting_reason, revision').eq('id', id).single();
  if (r.error) throw r.error;
  return r.data;
}

async function approvedEdit(who: Account, ref: string, fields: Record<string, unknown>) {
  const p = (await prepare(who, { type: 'task.edit_details', task_ref: ref, ...fields })).json.proposal;
  const r = await apply(who, p.operations, { authorization: approved(p) });
  assertEquals(r.status, 200, JSON.stringify(r.json));
  return r.json;
}

Deno.test({
  name: 'Undo of an edit restores exactly the earlier values, once',
  ...testOpts,
  fn: async () => {
    // Wrong if: Undo changes another field or the state, restores a value other than the
    // recorded one, or reverses the same receipt twice.
    const a = await newAccount('ana');
    const { ref, id } = await existingCustomTask(a, 'Get a phone plan');
    await apply(a, [setState(ref, 'in_progress', 1)]);
    const edited = await approvedEdit(a, ref, { title: 'Phone plan', priority: 'Do now' });
    assertEquals(edited.receipt.undoable, true);
    const u = await undo(a, edited.operation_id);
    assertEquals(u.status, 200, JSON.stringify(u.json));
    assertEquals([u.json.receipt.kind, u.json.receipt.undo_of, u.json.receipt.operation_type], ['undo', edited.operation_id, 'task.edit_details']);
    assertEquals(u.json.receipt.changes, [
      { field: 'title', before: 'Phone plan', after: 'Get a phone plan' },
      { field: 'priority', before: 'Do now', after: 'Do soon' },
    ]);
    const r = await row(a, id);
    assertEquals([r.title, r.priority, r.description, r.progress_state], ['Get a phone plan', 'Do soon', '', 'in_progress']);
    const again = await undo(a, edited.operation_id);
    assertEquals([again.status, again.json.error], [409, 'already_undone']);
  },
});

Deno.test({
  name: 'Undo after a newer edit keeps the newer values and offers a reviewed compensating change',
  ...testOpts,
  fn: async () => {
    // Wrong if: the Undo overwrites the newer title, the offered change is not at the
    // current revision, or approving it restores anything but the recorded earlier values.
    const a = await newAccount('bao');
    const { ref, id } = await existingCustomTask(a, 'Get a phone plan');
    const edited = await approvedEdit(a, ref, { priority: 'Do now' });
    // Another device renames the task (an older client writes the row directly).
    await a.client.from('custom_checklist_tasks').update({ title: 'Phone plan (renamed)' }).eq('id', id);
    const u = await undo(a, edited.operation_id);
    assertEquals([u.status, u.json.error], [409, 'undo_conflict'], JSON.stringify(u.json));
    assertEquals(u.json.proposal.operations, [{ type: 'task.edit_details', task_ref: ref, expected_revision: 3, priority: 'Do soon' }]);
    assertEquals(u.json.current[0].title, 'Phone plan (renamed)');
    assertEquals([(await row(a, id)).priority, (await row(a, id)).title], ['Do now', 'Phone plan (renamed)']);
    const ok = await apply(a, u.json.proposal.operations, { authorization: approved(u.json.proposal) });
    assertEquals(ok.status, 200, JSON.stringify(ok.json));
    assertEquals(ok.json.receipt.undo_of, edited.operation_id);
    const r = await row(a, id);
    assertEquals([r.priority, r.title], ['Do soon', 'Phone plan (renamed)']);
  },
});

Deno.test({
  name: 'Undo of a state command restores the earlier state and reason, and competing Undos reverse it once',
  ...testOpts,
  fn: async () => {
    // Wrong if: the earlier waiting reason is lost, or two simultaneous Undos both apply.
    const a = await newAccount('cam');
    const { ref } = await existingCustomTask(a, 'Get a phone plan');
    await apply(a, [setState(ref, 'waiting', 1, 'Store closed')]);
    const { message_id } = await conversationWith(a, 'user', 'Mark task "Get a phone plan" as completed');
    const i = await interpret(a, message_id);
    const done = await apply(a, [i.json.command.operation], { authorization: { kind: 'direct_command', message_id } });
    assertEquals(done.status, 200, JSON.stringify(done.json));
    assertEquals((await taskOf(a, ref)).state, 'completed');
    const [u1, u2] = await Promise.all([undo(a, done.json.operation_id), undo(a, done.json.operation_id)]);
    assertEquals([u1.status, u2.status].sort(), [200, 409], `${JSON.stringify(u1.json)} ${JSON.stringify(u2.json)}`);
    const t = await taskOf(a, ref);
    assertEquals([t.state, t.waiting_reason], ['waiting', 'Store closed']);
  },
});
