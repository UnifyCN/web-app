// Receipt-specific Undo (mobile-app#361) through the public boundary.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import {
  apply, existingCustomTask, existingSanityTask, newAccount, read, ready, setState, sql, status, taskOf, testOpts, undo,
  uuid,
} from './support.ts';

await ready();

async function waitingTask(label: string, reason: string) {
  const a = await newAccount(label);
  const ref = await existingSanityTask(a, 'sin-number');
  const t0 = await taskOf(a, ref);
  const w = await apply(a, [setState(ref, 'waiting', t0.revision, reason)]);
  assertEquals(w.status, 200, JSON.stringify(w.json));
  return { a, ref, rev: w.json.receipt.after_revision as number };
}

Deno.test({ name: 'Undo restores the exact earlier state and waiting reason of its own receipt', ...testOpts, fn: async () => {
  // Wrong if: the reason is lost, the state is a default instead of the earlier one,
  // or the reversed receipt still offers Undo.
  const { a, ref, rev } = await waitingTask('alice', 'Letter from Service Canada');
  const change = await apply(a, [setState(ref, 'in_progress', rev)]);
  assertEquals(change.status, 200);
  const r = await undo(a, change.json.operation_id);
  assertEquals(r.status, 200, JSON.stringify(r.json));
  assertEquals(r.json.receipt.kind, 'undo');
  assertEquals(r.json.receipt.undo_of, change.json.operation_id);
  assertEquals([r.json.receipt.before_state, r.json.receipt.after_state], ['in_progress', 'waiting']);
  assertEquals(r.json.receipt.undoable, false);
  const t = await taskOf(a, ref);
  assertEquals([t.state, t.waiting_reason], ['waiting', 'Letter from Service Canada']);
  assertEquals(t.last_receipt.operation_id, r.json.operation_id);
  const old = await status(a, change.json.operation_id);
  assertEquals([old.json.receipt.undone_by, old.json.receipt.undoable, old.json.receipt.current],
    [r.json.operation_id, false, false]);
}});

Deno.test({ name: 'Undo of completion restores the earlier state and does not restart a stopped reminder', ...testOpts, fn: async () => {
  const { a, ref, rev } = await waitingTask('alice', 'Bank appointment');
  // A pending reminder as the reminder slice will write it (service role only).
  const [rem] = await sql`insert into companion_task_reminders (user_id, task_ref, remind_at, time_zone)
    values (${a.id}, ${ref}, now() + interval '1 day', 'America/Vancouver') returning id`;
  const done = await apply(a, [setState(ref, 'completed', rev)]);
  assertEquals(done.status, 200);
  const [afterDone] = await sql`select status, cancelled_reason from companion_task_reminders where id = ${rem.id}`;
  assertEquals([afterDone.status, afterDone.cancelled_reason], ['cancelled', 'task_completed']);
  const r = await undo(a, done.json.operation_id);
  assertEquals(r.status, 200, JSON.stringify(r.json));
  const t = await taskOf(a, ref);
  assertEquals([t.state, t.waiting_reason], ['waiting', 'Bank appointment']);
  const [afterUndo] = await sql`select status, cancelled_reason from companion_task_reminders where id = ${rem.id}`;
  assertEquals([afterUndo.status, afterUndo.cancelled_reason], ['cancelled', 'task_completed']);
  const legacy = await a.client.from('user_tasks').select('completed').eq('sanity_checklist_id', 'sin-number').single();
  assertEquals(legacy.data?.completed, false);
}});

Deno.test({ name: 'an older receipt cannot reverse a newer edit: conflict keeps the newer state and offers a reviewed change', ...testOpts, fn: async () => {
  // Wrong if: Undo of the first receipt overwrites the second edit, or the proposal applies
  // without approval, or the approved proposal does not land.
  const a = await newAccount('alice');
  const { ref } = await existingCustomTask(a, 'Open a bank account');
  const t0 = await taskOf(a, ref);
  const first = await apply(a, [setState(ref, 'in_progress', t0.revision)]);
  const second = await apply(a, [setState(ref, 'waiting', first.json.receipt.after_revision, 'Card in the mail')]);
  assertEquals(second.status, 200);

  const stale = await taskOf(a, ref);
  assertEquals(stale.last_receipt.operation_id, second.json.operation_id);
  const firstNow = await status(a, first.json.operation_id);
  assertEquals(firstNow.json.receipt.current, false, 'a superseded receipt must not read as current');

  const undoOp = uuid();
  const r = await undo(a, first.json.operation_id, { operation_id: undoOp });
  assertEquals(r.status, 409, JSON.stringify(r.json));
  assertEquals(r.json.error, 'undo_conflict');
  assertEquals(r.json.current[0].state, 'waiting');
  assertEquals(r.json.current[0].waiting_reason, 'Card in the mail');
  const after = await taskOf(a, ref);
  assertEquals([after.state, after.waiting_reason, after.revision], ['waiting', 'Card in the mail', stale.revision]);
  const ops = r.json.proposal.operations;
  assertEquals(ops, [{ type: 'task.set_state', task_ref: ref, state: 'not_started', expected_revision: stale.revision }]);
  assertEquals((await status(a, undoOp)).json.status, 'not_applied', 'a conflicting Undo records no receipt');

  // Asking again returns the same draft rather than piling up proposals.
  const again = await undo(a, first.json.operation_id);
  assertEquals(again.json.proposal.proposal_id, r.json.proposal.proposal_id);

  const approved = await apply(a, ops, {
    authorization: { kind: 'approved_proposal', proposal_id: r.json.proposal.proposal_id, proposal_revision: r.json.proposal.proposal_revision },
  });
  assertEquals(approved.status, 200, JSON.stringify(approved.json));
  assertEquals(approved.json.receipt.kind, 'undo');
  assertEquals(approved.json.receipt.undo_of, first.json.operation_id);
  assertEquals((await taskOf(a, ref)).state, 'not_started');
  // The receipt is now reversed; a second reversal is refused.
  const twice = await undo(a, first.json.operation_id);
  assertEquals([twice.status, twice.json.error], [409, 'already_undone']);
}});

Deno.test({ name: 'a compensating proposal goes stale when the task changes again; nothing is overwritten', ...testOpts, fn: async () => {
  const a = await newAccount('alice');
  const { ref, id } = await existingCustomTask(a, 'Phone plan');
  const t0 = await taskOf(a, ref);
  const first = await apply(a, [setState(ref, 'in_progress', t0.revision)]);
  await apply(a, [setState(ref, 'waiting', first.json.receipt.after_revision)]);
  const r = await undo(a, first.json.operation_id);
  assertEquals(r.status, 409);
  // Another platform (here: the legacy Checklist write) completes the task meanwhile.
  const legacy = await a.client.from('custom_checklist_tasks').update({ completed: true, completed_at: new Date().toISOString() }).eq('id', id);
  assertEquals(legacy.error, null);
  const approved = await apply(a, r.json.proposal.operations, {
    authorization: { kind: 'approved_proposal', proposal_id: r.json.proposal.proposal_id, proposal_revision: r.json.proposal.proposal_revision },
  });
  assertEquals([approved.status, approved.json.error], [409, 'revision_conflict'], JSON.stringify(approved.json));
  assertEquals((await taskOf(a, ref)).state, 'completed');
  // A new review is built from the current state.
  const fresh = await undo(a, first.json.operation_id);
  assertEquals(fresh.status, 409);
  assert(fresh.json.proposal.proposal_id !== r.json.proposal.proposal_id);
  assertEquals(fresh.json.current[0].state, 'completed');
}});

Deno.test({ name: 'a legacy Checklist write after a receipt makes that receipt historical; Undo then asks for review', ...testOpts, fn: async () => {
  const a = await newAccount('alice');
  const ref = await existingSanityTask(a, 'health-card');
  const t0 = await taskOf(a, ref);
  const w = await apply(a, [setState(ref, 'in_progress', t0.revision)]);
  await a.client.from('user_tasks').update({ completed: true }).eq('sanity_checklist_id', 'health-card');
  const t = await taskOf(a, ref);
  assertEquals(t.state, 'completed');
  assertEquals([t.last_receipt.operation_id, t.last_receipt.current], [w.json.operation_id, false]);
  const r = await undo(a, w.json.operation_id);
  assertEquals([r.status, r.json.error], [409, 'undo_conflict']);
  assertEquals((await taskOf(a, ref)).state, 'completed');
}});

Deno.test({ name: 'concurrent Undo of one receipt: one reversal; duplicates of the same Undo replay', ...testOpts, fn: async () => {
  const { a, ref, rev } = await waitingTask('alice', 'Landlord reply');
  const change = await apply(a, [setState(ref, 'completed', rev)]);
  const op = uuid();
  const replies = await Promise.all([
    ...Array.from({ length: 4 }, () => undo(a, change.json.operation_id, { operation_id: op })),
    ...Array.from({ length: 4 }, () => undo(a, change.json.operation_id)),
  ]);
  const applied = replies.filter(r => r.status === 200 && r.json.replayed === false);
  assertEquals(applied.length, 1, JSON.stringify(replies.map(r => [r.status, r.json.error ?? r.json.replayed])));
  for (const r of replies) {
    assert(
      (r.status === 200) || (r.status === 409 && r.json.error === 'already_undone'),
      `unexpected reply ${r.status} ${JSON.stringify(r.json)}`,
    );
  }
  const [{ n }] = await sql`select count(*)::int n from companion_action_receipts where user_id = ${a.id} and undo_of is not null`;
  assertEquals(n, 1);
  const t = await taskOf(a, ref);
  assertEquals([t.state, t.waiting_reason], ['waiting', 'Landlord reply']);
}});

Deno.test({ name: 'Undo is scoped to the account and only to undoable receipts', ...testOpts, fn: async () => {
  const { a, ref, rev } = await waitingTask('alice', 'Reply');
  const b = await newAccount('bob');
  const change = await apply(a, [setState(ref, 'in_progress', rev)]);
  const cross = await undo(b, change.json.operation_id);
  assertEquals([cross.status, cross.json.error], [404, 'not_found']);
  assertEquals((await taskOf(a, ref)).state, 'in_progress');
  const u = await undo(a, change.json.operation_id);
  assertEquals(u.status, 200);
  const undoOfUndo = await undo(a, u.json.operation_id);
  assertEquals([undoOfUndo.status, undoOfUndo.json.reason], [422, 'not_undoable']);
  const unknown = await undo(a, uuid());
  assertEquals([unknown.status, unknown.json.reason], [404, 'receipt_not_found']);
  const proposalAuth = await undo(a, change.json.operation_id, {
    authorization: { kind: 'approved_proposal', proposal_id: uuid(), proposal_revision: 1 },
  });
  assertEquals(proposalAuth.status, 403);
  assertEquals((await read(b)).json.tasks, []);
}});

Deno.test({ name: 'cleanup', ...testOpts, fn: async () => { await sql.end(); } });
