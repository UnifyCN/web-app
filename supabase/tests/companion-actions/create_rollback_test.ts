// Rollback of the task creation migration (mobile-app#363), alone and together with
// the #361 rollback, through the public request boundary. The accepted #361 policy
// holds: legacy columns stay authoritative, operation identity survives a rollback and
// a re-application, and nothing is executed from an outdated approval or inverse. Each
// test names the observation that would prove the behavior wrong.
import { assertEquals } from 'jsr:@std/assert@1';
import {
  apply, approved, checklistTitles, conversationWith, createTask, existingSanityTask, migrate,
  migrate363, newAccount, openGate, prepare, proposalOf, read, ready, setProfile, setState, sql, status, testOpts, undo,
} from './support.ts';

await ready();

const confirmedRemoval = { kind: 'ui_control', removal_confirmed: true };

async function workInProgress(label: string) {
  await ready(); // each test starts from the full schema, whatever the last one left
  const a = await newAccount(label);
  await setProfile(a, { city: 'Vancouver', province: 'British Columbia', arrival_date: '2026-11-02T00:00:00Z' });
  const sin = await existingSanityTask(a, 'sin-number');
  const first = (await prepare(a, createTask('Set up phone service'))).json.proposal;
  const added = await apply(a, first.operations, { authorization: approved(first) });
  assertEquals(added.status, 200, JSON.stringify(added.json));
  const draft = (await prepare(a, createTask('Get a transit card'))).json.proposal;
  const { message_id } = await conversationWith(a, 'user', 'Add task: Get a library card');
  const cmd = await apply(a, [createTask('Get a library card')], { authorization: { kind: 'direct_command', message_id } });
  assertEquals(cmd.status, 200, JSON.stringify(cmd.json));
  return { a, sin, first, added, draft, message_id };
}

Deno.test({
  name: 'rolling back only #363 keeps #361 task controls, refuses (never misapplies) work it cannot do, and re-application restores it',
  ...testOpts,
  fn: async () => {
    // Wrong if: after the rollback an Undo of an added task changes the task or errors
    // with 500, a draft creates a task, #361 controls stop working; or after re-applying,
    // the Undo, the draft's context or the command's single use are lost.
    const { a, sin, added, draft, message_id } = await workInProgress('ana');
    await migrate363('down');
    await openGate();
    const s = (await read(a)).json.tasks.find((t: { task_ref: unknown }) => t.task_ref === sin);
    assertEquals((await apply(a, [setState(sin, 'in_progress', s.revision)])).status, 200);
    const u = await undo(a, added.json.operation_id, { authorization: confirmedRemoval });
    assertEquals([u.status, u.json.reason], [422, 'not_undoable'], JSON.stringify(u.json));
    assertEquals((await apply(a, draft.operations, { authorization: approved(draft) })).status, 422);
    assertEquals((await status(a, added.json.operation_id)).json.status, 'applied');
    assertEquals((await checklistTitles(a)).sort(), ['Get a library card', 'Set up phone service']);

    await migrate363('up');
    await openGate();
    const again = await apply(a, [createTask('Get a library card')], { authorization: { kind: 'direct_command', message_id } });
    assertEquals([again.status, again.json.error], [409, 'command_already_used']);
    // An approval captured before the rollback is not used: the draft asks for review again.
    assertEquals((await apply(a, draft.operations, { authorization: approved(draft) })).status, 403);
    const restored = (await proposalOf(a, draft.proposal_id)).json.proposal;
    assertEquals([restored.status, restored.review_reason, restored.proposal_revision], ['draft', 'restored', 2]);
    assertEquals(restored.context, draft.context);
    const ok = await apply(a, restored.operations, { authorization: approved(restored) });
    assertEquals(ok.status, 200, JSON.stringify(ok.json));
    const u2 = await undo(a, added.json.operation_id, { authorization: confirmedRemoval });
    assertEquals(u2.status, 200, JSON.stringify(u2.json));
    assertEquals((await checklistTitles(a)).sort(), ['Get a library card', 'Get a transit card']);
  },
});

Deno.test({
  name: 'a full rollback and re-application keeps operation identity: a retried create replays and adds nothing',
  ...testOpts,
  fn: async () => {
    // Wrong if: the retry after re-application adds a second task, the lookup forgets
    // the operation, or the old approval of the draft applies without a new review.
    const { a, first, added, draft } = await workInProgress('ben');
    await migrate('down');
    assertEquals((await checklistTitles(a)).sort(), ['Get a library card', 'Set up phone service']);
    await migrate('up');
    await openGate();
    const retry = await apply(a, first.operations, { operation_id: added.json.operation_id, authorization: approved(first) });
    assertEquals([retry.status, retry.json.replayed], [200, true], JSON.stringify(retry.json));
    assertEquals((await status(a, added.json.operation_id)).json.status, 'applied');
    // An approval captured before the rollback is not used: the draft asks for review again.
    assertEquals((await apply(a, draft.operations, { authorization: approved(draft) })).status, 403);
    assertEquals((await proposalOf(a, draft.proposal_id)).json.proposal.review_reason, 'restored');
    assertEquals((await checklistTitles(a)).sort(), ['Get a library card', 'Set up phone service']);
  },
});

Deno.test({ name: 'cleanup', ...testOpts, fn: async () => { await migrate('up').catch(() => {}); await sql.end(); } });
