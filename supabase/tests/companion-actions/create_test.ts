// Companion task creation (mobile-app#363) through the public request boundary,
// against a real local Postgres + GoTrue + PostgREST + edge runtime. Fixture: a
// fictional newcomer arriving in Vancouver next week who already has a SIN task and a
// bank-account task, and asks Companion for the missing phone-service task. Each test
// names the observation that would prove the behavior wrong.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import {
  apply, approved, checklistTitles, conversationWith, createTask, existingCustomTask, existingSanityTask,
  holdOperationLock, newAccount, prepare, proposalOf, read, ready, revise, setProfile, sql, status, testOpts, uuid,
  waitForBlocked,
} from './support.ts';

await ready();

const PHONE = 'Set up phone service';

async function vancouverArrival(label: string) {
  const a = await newAccount(label);
  await setProfile(a, {
    persona: 'skilled_worker', city: 'Vancouver', province: 'British Columbia',
    arrival_date: '2026-11-02T00:00:00Z', stage: 0, wants_reminders: false,
  });
  await existingSanityTask(a, 'sin-number');
  await existingSanityTask(a, 'bank-account');
  return a;
}

Deno.test({
  name: 'a prepared task is a draft only; approving the shown revision adds exactly one shared task with its receipt',
  ...testOpts,
  fn: async () => {
    // Wrong if: preparing writes a task, the draft hides its exact operation or context,
    // approval adds zero or two tasks, the receipt names another task, or another
    // conversation, platform or the legacy Checklist reads something different.
    const a = await vancouverArrival('ana');
    const { conversation_id, message_id } = await conversationWith(a, 'user', 'What else do I need in my first week?');

    const p = await prepare(a, createTask(PHONE), { source: { conversation_id, message_id } });
    assertEquals(p.status, 200, JSON.stringify(p.json));
    const draft = p.json.proposal;
    assertEquals(draft.status, 'draft');
    assertEquals(draft.kind, 'task_create');
    assertEquals(draft.proposal_revision, 1);
    assertEquals(draft.operations, [{ type: 'task.create_custom', title: PHONE, priority: 'Do soon' }]);
    assertEquals(draft.context.profile, { city: 'Vancouver', province: 'British Columbia', arrival_date: '2026-11-02T00:00:00+00:00' });
    assertEquals(draft.context.same_title_tasks, []);
    assertEquals(draft.source, { conversation_id, message_id });
    assertEquals(await checklistTitles(a), [], 'preparing wrote a task');

    const w = await apply(a, draft.operations, { authorization: approved(draft) });
    assertEquals(w.status, 200, JSON.stringify(w.json));
    assertEquals([w.json.status, w.json.replayed], ['applied', false]);
    const receipt = w.json.receipt;
    assertEquals(receipt.operation_type, 'task.create_custom');
    assertEquals(receipt.title, PHONE);
    assert(/^custom:[1-9][0-9]*$/.test(receipt.task_ref), receipt.task_ref);
    assertEquals([receipt.before_revision, receipt.current, receipt.undoable], [0, true, true]);
    assertEquals(await checklistTitles(a), [PHONE]);

    // Another platform and a later read of the proposal see the same task and receipt.
    const web = await read(a, 'web');
    const task = web.json.tasks.find((t: any) => t.task_ref === receipt.task_ref);
    assertEquals([task.title, task.state, task.removed], [PHONE, 'not_started', false]);
    assertEquals(task.last_receipt.operation_id, w.json.operation_id);
    const later = await proposalOf(a, draft.proposal_id);
    assertEquals(later.status, 200, JSON.stringify(later.json));
    assertEquals(later.json.proposal.status, 'applied');
    assertEquals(later.json.proposal.receipt.operation_id, w.json.operation_id);
    const [{ n }] = await sql`select count(*)::int n from custom_checklist_tasks where user_id = ${a.id}`;
    assertEquals(n, 1);
  },
});


async function draftFor(a: Awaited<ReturnType<typeof vancouverArrival>>, title = PHONE) {
  const p = await prepare(a, createTask(title));
  assertEquals(p.status, 200, JSON.stringify(p.json));
  return p.json.proposal;
}

async function liveTasks(userId: string): Promise<number> {
  const [{ n }] = await sql`select count(*)::int n from custom_checklist_tasks where user_id = ${userId} and removed_at is null`;
  return n;
}

Deno.test({
  name: 'repeated taps and concurrent retries of one approval add one task and replay one receipt',
  ...testOpts,
  fn: async () => {
    // Wrong if: two tasks exist, two receipts are recorded, or a retry reports a new write.
    const a = await vancouverArrival('ben');
    const draft = await draftFor(a);
    const operation_id = uuid();
    const replies = await Promise.all(
      Array.from({ length: 6 }, () => apply(a, draft.operations, { operation_id, authorization: approved(draft) })),
    );
    assertEquals(replies.map(r => r.status), [200, 200, 200, 200, 200, 200], JSON.stringify(replies.map(r => r.json)));
    assertEquals(replies.filter(r => r.json.replayed === false).length, 1);
    assertEquals(new Set(replies.map(r => r.json.receipt.task_ref)).size, 1);
    assertEquals(await liveTasks(a.id), 1);
    const [{ n }] = await sql`select count(*)::int n from companion_action_receipts where user_id = ${a.id}`;
    assertEquals(n, 1);
  },
});

Deno.test({
  name: 'two approvals of one proposal with different operation ids, released together from a held lock, add one task',
  ...testOpts,
  fn: async () => {
    // Wrong if: both succeed (two tasks), or the loser is reported as applied.
    const a = await vancouverArrival('cy');
    const draft = await draftFor(a);
    let release!: () => void;
    const held = new Promise<void>(r => (release = r));
    let markReady!: () => void;
    const lockReady = new Promise<void>(r => (markReady = r));
    const holder = sql.begin(async t => {
      await t`select 1 from companion_proposals where id = ${draft.proposal_id} for update`;
      markReady();
      await held;
    });
    await lockReady;
    const first = apply(a, draft.operations, { authorization: approved(draft) });
    const second = apply(a, draft.operations, { authorization: approved(draft) });
    assertEquals(await waitForBlocked(2, '%companion_apply_actions%'), 2, 'both approvals must wait on the held proposal');
    release();
    await holder;
    const results = await Promise.all([first, second]);
    assertEquals(results.map(r => r.status).sort(), [200, 403], JSON.stringify(results.map(r => r.json)));
    assertEquals(await liveTasks(a.id), 1);
  },
});

Deno.test({
  name: 'a reply lost after commit is recovered by lookup; the retry replays and writes nothing',
  ...testOpts,
  fn: async () => {
    // Wrong if: the lookup says not applied, or the retry adds a second task.
    const a = await vancouverArrival('dee');
    const draft = await draftFor(a);
    const operation_id = uuid();
    await apply(a, draft.operations, { operation_id, authorization: approved(draft) }); // reply dropped
    const s = await status(a, operation_id);
    assertEquals([s.status, s.json.status, s.json.receipt.operation_type], [200, 'applied', 'task.create_custom']);
    const retry = await apply(a, draft.operations, { operation_id, authorization: approved(draft) });
    assertEquals([retry.status, retry.json.replayed, retry.json.receipt.task_ref], [200, true, s.json.receipt.task_ref]);
    assertEquals(await liveTasks(a.id), 1);
  },
});

Deno.test({
  name: 'while a write holds the operation, lookup is pending; once confirmed not applied, the same id applies once',
  ...testOpts,
  fn: async () => {
    // Wrong if: pending is reported as not applied (inviting a second write), or the
    // confirmed-not-applied retry adds more than one task.
    const a = await vancouverArrival('eve');
    const draft = await draftFor(a);
    const operation_id = uuid();
    const lock = holdOperationLock(a.id, operation_id);
    await lock.ready;
    const pending = await status(a, operation_id);
    assertEquals([pending.status, pending.json.status], [200, 'pending']);
    await lock.release();
    const notApplied = await status(a, operation_id);
    assertEquals(notApplied.json.status, 'not_applied');
    assertEquals(await liveTasks(a.id), 0);
    const w = await apply(a, draft.operations, { operation_id, authorization: approved(draft) });
    assertEquals([w.status, w.json.replayed], [200, false]);
    assertEquals(await liveTasks(a.id), 1);
  },
});


Deno.test({
  name: 'editing the draft makes a new revision: the old approval writes nothing, the new one adds the edited title',
  ...testOpts,
  fn: async () => {
    // Wrong if: an approval of revision 1 creates a task after the edit, or the task
    // created has a title the user did not review.
    const a = await vancouverArrival('fay');
    const draft = await draftFor(a);
    const edited = await revise(a, draft.proposal_id, 1, createTask('Get a Canadian SIM card'));
    assertEquals(edited.status, 200, JSON.stringify(edited.json));
    assertEquals([edited.json.proposal.proposal_revision, edited.json.proposal.review_reason], [2, 'edited']);
    assertEquals(edited.json.proposal.operations[0].title, 'Get a Canadian SIM card');

    const stale = await apply(a, draft.operations, { authorization: approved(draft) });
    assertEquals(stale.status, 403, JSON.stringify(stale.json));
    const staleNewOps = await apply(a, edited.json.proposal.operations, { authorization: approved(draft) });
    assertEquals(staleNewOps.status, 403, JSON.stringify(staleNewOps.json));
    assertEquals(await checklistTitles(a), []);
    // A second edit from the same old revision is refused: the client must review the current one.
    const lateEdit = await revise(a, draft.proposal_id, 1, createTask('Something else'));
    assertEquals([lateEdit.status, lateEdit.json.error], [409, 'proposal_changed']);
    assertEquals(lateEdit.json.proposal.proposal_revision, 2);

    const ok = await apply(a, edited.json.proposal.operations, { authorization: approved(edited.json.proposal) });
    assertEquals(ok.status, 200, JSON.stringify(ok.json));
    assertEquals(await checklistTitles(a), ['Get a Canadian SIM card']);
  },
});

Deno.test({
  name: 'a relevant profile change since review needs a new review; approving the refreshed revision applies',
  ...testOpts,
  fn: async () => {
    // Wrong if: the old approval writes after the province changed, the refreshed draft
    // hides the current value, or the refreshed approval is refused.
    const a = await vancouverArrival('gus');
    const draft = await draftFor(a);
    await setProfile(a, { city: 'Toronto', province: 'Ontario' }); // another platform
    const r = await apply(a, draft.operations, { authorization: approved(draft) });
    assertEquals([r.status, r.json.error], [409, 'needs_review'], JSON.stringify(r.json));
    const refreshed = r.json.proposal;
    assertEquals([refreshed.proposal_revision, refreshed.review_reason, refreshed.status], [2, 'context_changed', 'draft']);
    assertEquals([refreshed.context.profile.city, refreshed.context.profile.province], ['Toronto', 'Ontario']);
    assertEquals(refreshed.previous_context.profile.city, 'Vancouver');
    assertEquals(await checklistTitles(a), []);
    // The same old approval again is now simply stale.
    assertEquals((await apply(a, draft.operations, { authorization: approved(draft) })).status, 403);

    const ok = await apply(a, refreshed.operations, { authorization: approved(refreshed) });
    assertEquals(ok.status, 200, JSON.stringify(ok.json));
    assertEquals(await checklistTitles(a), [PHONE]);
  },
});

Deno.test({
  name: 'unrelated changes since review do not ask for approval again',
  ...testOpts,
  fn: async () => {
    // Wrong if: a reminder preference, stage, a state change of another task, or a new
    // task with another title forces a second approval.
    const a = await vancouverArrival('hal');
    const draft = await draftFor(a);
    await setProfile(a, { wants_reminders: true, stage: 1, persona: 'refugee' });
    await existingCustomTask(a, 'Find a family doctor');
    await existingSanityTask(a, 'sin-number', true);
    const r = await apply(a, draft.operations, { authorization: approved(draft) });
    assertEquals(r.status, 200, JSON.stringify(r.json));
    assertEquals(await checklistTitles(a), ['Find a family doctor', PHONE]);
  },
});

Deno.test({
  name: 'a task with the same title added elsewhere since review needs a new review that names it',
  ...testOpts,
  fn: async () => {
    // Wrong if: approval silently adds a second task with that title.
    const a = await vancouverArrival('ida');
    const draft = await draftFor(a);
    const other = await existingCustomTask(a, '  set up  PHONE service ');
    const r = await apply(a, draft.operations, { authorization: approved(draft) });
    assertEquals([r.status, r.json.error], [409, 'needs_review'], JSON.stringify(r.json));
    assertEquals(r.json.proposal.context.same_title_tasks.map((t: any) => t.task_ref), [other.ref]);
    assertEquals(await liveTasks(a.id), 1);
    // The user saw it and still wants the task: approving the refreshed revision adds it.
    const ok = await apply(a, r.json.proposal.operations, { authorization: approved(r.json.proposal) });
    assertEquals(ok.status, 200, JSON.stringify(ok.json));
    assertEquals(await liveTasks(a.id), 2);
  },
});

Deno.test({ name: 'cleanup', ...testOpts, fn: async () => { await sql.end(); } });
