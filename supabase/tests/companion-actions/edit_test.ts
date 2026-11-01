// Editing an existing Checklist task through a reviewed proposal (mobile-app#365), through
// the public request boundary. A suggested edit is a server-owned draft bound to the exact
// operation and the values it was reviewed against: preparing writes no task, approval
// applies exactly that change once, and a newer edit of a field the change touches needs
// a new review. Each test names the observation that would prove the behavior wrong.
import { assertEquals } from 'jsr:@std/assert@1';
import {
  apply, approved, conversationActions, conversationWith, existingCustomTask, existingSanityTask, holdTaskRow,
  newAccount, prepare, proposalOf, read, ready, setState, taskOf, testOpts, uuid, waitForBlocked,
} from './support.ts';

await ready();

const editDraft = (task_ref: string, fields: Record<string, unknown>) => ({ type: 'task.edit_details', task_ref, ...fields });
const stateDraft = (task_ref: string, state: string, waiting_reason?: string) => ({
  type: 'task.set_state', task_ref, state, ...(waiting_reason === undefined ? {} : { waiting_reason }),
});

/** The custom task as today's Checklist reads it (user JWT, RLS, select '*'). */
async function checklistRow(who: Awaited<ReturnType<typeof newAccount>>, id: number) {
  const r = await who.client.from('custom_checklist_tasks').select('*').eq('id', id).maybeSingle();
  if (r.error) throw r.error;
  return r.data as Record<string, unknown> | null;
}

Deno.test({
  name: 'a suggested edit is a draft until approved, and approval applies exactly the reviewed change once',
  ...testOpts,
  fn: async () => {
    // Wrong if: preparing changes the task, the draft does not show the value it changes
    // from, two approvals with different operation ids both write, the receipt does not
    // name the exact before and after value, or the conversation loses the draft.
    const a = await newAccount('ana');
    const { ref, id } = await existingCustomTask(a, 'Get a phone plan');
    const { conversation_id, message_id } = await conversationWith(a, 'assistant', 'You could do this sooner.');
    const p = await prepare(a, editDraft(ref, { priority: 'Do now' }), { source: { conversation_id, message_id } });
    assertEquals(p.status, 200, JSON.stringify(p.json));
    const proposal = p.json.proposal;
    assertEquals([proposal.kind, proposal.status, proposal.proposal_revision], ['task_edit', 'draft', 1]);
    assertEquals(proposal.operations, [{ type: 'task.edit_details', task_ref: ref, expected_revision: 1, priority: 'Do now' }]);
    assertEquals(proposal.context.task, {
      task_ref: ref, revision: 1, removed: false, state: 'not_started', waiting_reason: null,
      title: 'Get a phone plan', description: '', priority: 'Do soon',
    });
    assertEquals((await checklistRow(a, id))?.priority, 'Do soon', 'preparing changed the task');

    const [r1, r2] = await Promise.all([
      apply(a, proposal.operations, { authorization: approved(proposal) }),
      apply(a, proposal.operations, { authorization: approved(proposal) }),
    ]);
    const statuses = [r1.status, r2.status].sort();
    assertEquals(statuses, [200, 403], `${JSON.stringify(r1.json)} ${JSON.stringify(r2.json)}`);
    const ok = r1.status === 200 ? r1 : r2;
    assertEquals(ok.json.receipt.operation_type, 'task.edit_details');
    assertEquals(ok.json.receipt.title, 'Get a phone plan');
    assertEquals(ok.json.receipt.changes, [{ field: 'priority', before: 'Do soon', after: 'Do now' }]);
    assertEquals([ok.json.receipt.before_revision, ok.json.receipt.after_revision, ok.json.receipt.current], [1, 2, true]);
    const row = await checklistRow(a, id);
    assertEquals([row?.priority, row?.title, row?.revision], ['Do now', 'Get a phone plan', 2]);

    const conv = await conversationActions(a, conversation_id);
    assertEquals(conv.status, 200, JSON.stringify(conv.json));
    const shown = conv.json.proposals.find((x: { proposal_id: string }) => x.proposal_id === proposal.proposal_id);
    assertEquals([shown?.status, shown?.receipt?.operation_id], ['applied', ok.json.operation_id]);
  },
});

Deno.test({
  name: 'a renamed or re-described task keeps its identity, and the old receipt keeps the old title',
  ...testOpts,
  fn: async () => {
    // Wrong if: the rename creates another task, the description edit drops the title,
    // or a later receipt rewrites what an earlier one recorded.
    const a = await newAccount('bao');
    const { ref, id } = await existingCustomTask(a, 'Get a phone plan');
    const p1 = (await prepare(a, editDraft(ref, { title: 'Get a prepaid phone plan' }))).json.proposal;
    const first = await apply(a, p1.operations, { authorization: approved(p1) });
    assertEquals(first.status, 200, JSON.stringify(first.json));
    assertEquals(first.json.receipt.changes, [{ field: 'title', before: 'Get a phone plan', after: 'Get a prepaid phone plan' }]);
    const p2 = (await prepare(a, editDraft(ref, { description: 'Compare two carriers first.' }))).json.proposal;
    assertEquals(p2.operations[0].expected_revision, 2);
    const second = await apply(a, p2.operations, { authorization: approved(p2) });
    assertEquals(second.status, 200, JSON.stringify(second.json));
    assertEquals(second.json.receipt.changes, [{ field: 'description', before: '', after: 'Compare two carriers first.' }]);
    const rows = await a.client.from('custom_checklist_tasks').select('id, title, description');
    assertEquals(rows.data, [{ id, title: 'Get a prepaid phone plan', description: 'Compare two carriers first.' }]);
    // The first receipt still names the change it saved.
    const again = (await proposalOf(a, p1.proposal_id)).json.proposal;
    assertEquals(again.receipt.changes, [{ field: 'title', before: 'Get a phone plan', after: 'Get a prepaid phone plan' }]);
    assertEquals(again.receipt.current, false);
  },
});

Deno.test({
  name: 'a suggested state change shows the state it changes from and applies only that state and reason',
  ...testOpts,
  fn: async () => {
    // Wrong if: the draft carries a revision other than the current one, approving writes a
    // different state or reason, or completing the task is applied without approval.
    const a = await newAccount('cam');
    const { ref } = await existingCustomTask(a, 'Get a phone plan');
    const p = await prepare(a, stateDraft(ref, 'waiting', 'Waiting for the SIM card'));
    assertEquals(p.status, 200, JSON.stringify(p.json));
    const proposal = p.json.proposal;
    assertEquals(proposal.operations, [setState(ref, 'waiting', 1, 'Waiting for the SIM card')]);
    assertEquals([proposal.context.task.state, proposal.context.task.waiting_reason], ['not_started', null]);
    assertEquals((await taskOf(a, ref)).state, 'not_started', 'preparing changed the state');
    const ok = await apply(a, proposal.operations, { authorization: approved(proposal) });
    assertEquals(ok.status, 200, JSON.stringify(ok.json));
    const t = await taskOf(a, ref);
    assertEquals([t.state, t.waiting_reason], ['waiting', 'Waiting for the SIM card']);

    // A suggestion to complete the whole task is a draft like any other.
    const done = (await prepare(a, stateDraft(ref, 'completed'))).json.proposal;
    assertEquals((await taskOf(a, ref)).state, 'waiting', 'a completion draft completed the task');
    assertEquals(done.context.task.state, 'waiting');
  },
});

Deno.test({
  name: 'a draft that changes nothing, names a removed task or another account\'s task, or carries a revision is refused',
  ...testOpts,
  fn: async () => {
    // Wrong if: any of these creates a draft (and so an approval control), or reveals
    // another account's task.
    const a = await newAccount('dev');
    const b = await newAccount('eve');
    const { ref } = await existingCustomTask(a, 'Get a phone plan');
    const theirs = await existingCustomTask(b, 'Their task');
    const cases: [unknown, number, string][] = [
      [editDraft(ref, { priority: 'Do soon' }), 422, 'no_change'],
      [editDraft(ref, { title: 'Get a phone plan' }), 422, 'no_change'],
      [editDraft(ref, {}), 422, 'invalid_operations'],
      [editDraft(ref, { priority: 'Urgent' }), 422, 'invalid_priority'],
      [editDraft(ref, { title: 'Two\nlines' }), 422, 'invalid_title'],
      [editDraft(ref, { title: ' padded ' }), 422, 'invalid_title'],
      [editDraft(ref, { priority: 'Do now', expected_revision: 1 }), 422, 'unknown_field'],
      [editDraft(theirs.ref, { priority: 'Do now' }), 404, 'task_not_found'],
      [editDraft('sanity:sin-number', { title: 'My SIN' }), 422, 'shared_task_field'],
      [stateDraft(theirs.ref, 'completed'), 404, 'task_not_found'],
    ];
    for (const [draft, status, reason] of cases) {
      const r = await prepare(a, draft);
      assertEquals([r.status, r.json.reason], [status, reason], `${JSON.stringify(draft)} -> ${JSON.stringify(r.json)}`);
    }
    await sqlRemove(ref);
    const r = await prepare(a, editDraft(ref, { priority: 'Do now' }));
    assertEquals([r.status, r.json.reason], [422, 'task_removed']);
    const theirRow = await b.client.from('custom_checklist_tasks').select('title, priority').eq('id', theirs.id).single();
    assertEquals(theirRow.data, { title: 'Their task', priority: 'Do soon' });
  },
});

Deno.test({
  name: 'an edit of a task\'s details needs a reviewed proposal or a clear command, never a control or a model flag',
  ...testOpts,
  fn: async () => {
    // Wrong if: a ui_control request or a model-supplied approval changes a title.
    const a = await newAccount('fay');
    const { ref, id } = await existingCustomTask(a, 'Get a phone plan');
    const op = { type: 'task.edit_details', task_ref: ref, expected_revision: 1, title: 'Hijacked' };
    for (const authorization of [{ kind: 'ui_control' }, { kind: 'model', approved: true }, { approved: true }]) {
      const r = await apply(a, [op], { authorization });
      assertEquals(r.status, 403, `${JSON.stringify(authorization)} -> ${JSON.stringify(r.json)}`);
    }
    assertEquals((await checklistRow(a, id))?.title, 'Get a phone plan');
    // Sanity content is shared: no operation may carry its title, description or priority.
    const sin = await existingSanityTask(a, 'sin-number');
    const shared = await apply(a, [{ type: 'task.edit_details', task_ref: sin, expected_revision: 1, title: 'Mine' }],
      { authorization: { kind: 'approved_proposal', proposal_id: uuid(), proposal_revision: 1 } });
    assertEquals([shared.status, shared.json.reason], [422, 'shared_task_field']);
  },
});

/** Soft-removes a custom task the way the action service records a removal. */
async function sqlRemove(ref: string) {
  const { sql } = await import('./support.ts');
  await sql`update public.custom_checklist_tasks set removed_at = now() where id = ${Number(ref.slice(7))}`;
}

// ------------------------------------------------------------- stale approvals (slice 2)

Deno.test({
  name: 'a newer edit of the field a proposal changes gives a revised proposal and writes nothing',
  ...testOpts,
  fn: async () => {
    // Wrong if: the stale approval writes, the revised proposal does not show the old and
    // the current value, the old approval still applies, or the revision cannot be approved.
    const a = await newAccount('gus');
    const { ref, id } = await existingCustomTask(a, 'Get a phone plan');
    const proposal = (await prepare(a, editDraft(ref, { priority: 'Do now' }))).json.proposal;
    // Another device (an older client, direct table write) changes the priority.
    const legacy = await a.client.from('custom_checklist_tasks').update({ priority: 'Explore and connect' }).eq('id', id);
    assertEquals(legacy.error, null);
    const stale = await apply(a, proposal.operations, { authorization: approved(proposal) });
    assertEquals([stale.status, stale.json.error], [409, 'needs_review'], JSON.stringify(stale.json));
    const revised = stale.json.proposal;
    assertEquals([revised.proposal_id, revised.proposal_revision, revised.review_reason], [proposal.proposal_id, 2, 'context_changed']);
    assertEquals([revised.previous_context.task.priority, revised.context.task.priority], ['Do soon', 'Explore and connect']);
    assertEquals(revised.operations, [{ type: 'task.edit_details', task_ref: ref, expected_revision: 2, priority: 'Do now' }]);
    assertEquals((await checklistRow(a, id))?.priority, 'Explore and connect', 'the stale approval wrote');
    const replay = await apply(a, proposal.operations, { authorization: approved(proposal) });
    assertEquals(replay.status, 403, `the old approval applied: ${JSON.stringify(replay.json)}`);
    const ok = await apply(a, revised.operations, { authorization: approved(revised) });
    assertEquals(ok.status, 200, JSON.stringify(ok.json));
    assertEquals(ok.json.receipt.changes, [{ field: 'priority', before: 'Explore and connect', after: 'Do now' }]);
  },
});

Deno.test({
  name: 'a change to another field of the same task does not need a new approval',
  ...testOpts,
  fn: async () => {
    // Wrong if: a state change elsewhere forces a new review of a priority edit, or the
    // approved edit overwrites that state change.
    const a = await newAccount('hal');
    const { ref, id } = await existingCustomTask(a, 'Get a phone plan');
    const proposal = (await prepare(a, editDraft(ref, { priority: 'Do now' }))).json.proposal;
    const moved = await apply(a, [setState(ref, 'in_progress', 1)], { platform: 'web' });
    assertEquals(moved.status, 200, JSON.stringify(moved.json));
    const ok = await apply(a, proposal.operations, { authorization: approved(proposal) });
    assertEquals(ok.status, 200, JSON.stringify(ok.json));
    assertEquals([ok.json.receipt.before_revision, ok.json.receipt.after_revision], [2, 3]);
    const row = await checklistRow(a, id);
    assertEquals([row?.priority, row?.progress_state], ['Do now', 'in_progress']);
  },
});

Deno.test({
  name: 'a newer state change elsewhere gives a state proposal a new review',
  ...testOpts,
  fn: async () => {
    // Wrong if: an approval reviewed against "Not started" overwrites a newer "Waiting".
    const a = await newAccount('ida');
    const { ref } = await existingCustomTask(a, 'Get a phone plan');
    const proposal = (await prepare(a, stateDraft(ref, 'in_progress'))).json.proposal;
    await apply(a, [setState(ref, 'waiting', 1, 'Store closed')], { platform: 'android' });
    const stale = await apply(a, proposal.operations, { authorization: approved(proposal) });
    assertEquals([stale.status, stale.json.error], [409, 'needs_review'], JSON.stringify(stale.json));
    assertEquals([stale.json.proposal.previous_context.task.state, stale.json.proposal.context.task.state], ['not_started', 'waiting']);
    const t = await taskOf(a, ref);
    assertEquals([t.state, t.waiting_reason], ['waiting', 'Store closed']);
  },
});

Deno.test({
  name: 'two approvals of one edit released together from a held task lock apply once',
  ...testOpts,
  fn: async () => {
    // Wrong if: both operation ids write (two receipts or two revisions).
    const a = await newAccount('jon');
    const { ref, id } = await existingCustomTask(a, 'Get a phone plan');
    const proposal = (await prepare(a, editDraft(ref, { priority: 'Do now' }))).json.proposal;
    const hold = holdTaskRow('custom_checklist_tasks', { column: 'id', value: id });
    await hold.ready;
    const racing = Promise.all([
      apply(a, proposal.operations, { authorization: approved(proposal) }),
      apply(a, proposal.operations, { authorization: approved(proposal) }),
    ]);
    const blocked = await waitForBlocked(2);
    assertEquals(blocked >= 2, true, `only ${blocked} request(s) reached the lock`);
    await hold.release();
    const results = await racing;
    assertEquals(results.map(r => r.status).sort(), [200, 403], JSON.stringify(results.map(r => r.json)));
    const row = await checklistRow(a, id);
    assertEquals([row?.priority, row?.revision], ['Do now', 2]);
    const reads = await read(a);
    assertEquals(reads.json.tasks.find((t: { task_ref: string }) => t.task_ref === ref).revision, 2);
  },
});
