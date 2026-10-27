// Settlement plan approval under retries, races and lost replies (mobile-app#364),
// through the public request boundary against the real local stack. Simultaneous
// requests run concurrently in the same test; held locks are real database locks.
// Each test names the observation that would prove the behavior wrong.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { draftFor, GOAL, journeyItems, PHONE, vancouverArrival } from './planSupport.ts';
import {
  call, customRows, holdOperationLock, newItem, planApply, planPrepare, planRetry, planStatus, plansOf, ready, sql,
  testOpts, uuid, waitForBlocked,
} from './support.ts';

await ready();

async function planCount(userId: string): Promise<number> {
  const [{ n }] = await sql`select count(*)::int n from companion_plans where user_id = ${userId}`;
  return n;
}

Deno.test({
  name: 'repeated taps and concurrent retries of one plan approval save one plan, one new task and one receipt',
  ...testOpts,
  fn: async () => {
    // Wrong if: two plans or two phone tasks exist, more than one reply is a new write,
    // or the replays name a different task.
    const { a, sin, bank } = await vancouverArrival('hal');
    const draft = await draftFor(a, sin, bank);
    const operation_id = uuid();
    const replies = await Promise.all(Array.from({ length: 6 }, () => planApply(a, draft, { operation_id })));
    assertEquals(replies.map(r => r.status), [200, 200, 200, 200, 200, 200], JSON.stringify(replies.map(r => r.json)));
    assertEquals(replies.filter(r => r.json.replayed === false).length, 1);
    assertEquals(new Set(replies.map(r => r.json.receipt.results[2].task_ref)).size, 1);
    assertEquals((await customRows(a.id)).map(r => r.title), [PHONE]);
    assertEquals(await planCount(a.id), 1);
  },
});

Deno.test({
  name: 'two approvals of one draft with different operation ids, released together from a held lock, save once',
  ...testOpts,
  fn: async () => {
    // Wrong if: both save (two plans, two tasks) or the loser is reported as saved.
    const { a, sin, bank } = await vancouverArrival('ida');
    const draft = await draftFor(a, sin, bank);
    let release!: () => void;
    const held = new Promise<void>(r => (release = r));
    let markReady!: () => void;
    const lockReady = new Promise<void>(r => (markReady = r));
    const holder = sql.begin(async t => {
      await t`select 1 from companion_plan_proposals where id = ${draft.plan_proposal_id} for update`;
      markReady();
      await held;
    });
    await lockReady;
    const racing = [planApply(a, draft), planApply(a, draft)];
    let blocked: number;
    try {
      blocked = await waitForBlocked(2, '%companion_plan_apply%');
    } finally {
      release();
      await holder;
    }
    assertEquals(blocked, 2);
    const [x, y] = await Promise.all(racing);
    const statuses = [x.status, y.status].sort();
    assertEquals(statuses, [200, 409], JSON.stringify([x.json, y.json]));
    const loser = x.status === 409 ? x : y;
    assertEquals(loser.json.error, 'proposal_changed');
    assertEquals(loser.json.plan_proposal.status, 'applied');
    assertEquals((await customRows(a.id)).length, 1);
    assertEquals(await planCount(a.id), 1);
  },
});

Deno.test({
  name: 'a reply lost after commit is found by lookup, and a retry with the same id replays it',
  ...testOpts,
  fn: async () => {
    // Wrong if: the lookup says not applied after a commit, or the retry writes again.
    const { a, sin, bank } = await vancouverArrival('jo');
    const draft = await draftFor(a, sin, bank);
    const operation_id = uuid();
    // The client never reads this reply (dropped connection after the commit).
    await planApply(a, draft, { operation_id });
    const s = await planStatus(a, operation_id);
    assertEquals([s.status, s.json.status], [200, 'applied'], JSON.stringify(s.json));
    assertEquals(s.json.receipt.results.map((r: { outcome: string }) => r.outcome), ['reused', 'reused', 'created']);
    const retry = await planApply(a, draft, { operation_id });
    assertEquals([retry.status, retry.json.replayed], [200, true]);
    assertEquals((await customRows(a.id)).length, 1);
  },
});

Deno.test({
  name: 'while the approval is in flight the lookup says pending; afterwards not applied; the same id then saves once',
  ...testOpts,
  fn: async () => {
    // Wrong if: pending is reported as applied or not applied, a lookup writes anything,
    // or the confirmed-not-applied retry with the same id saves twice.
    const { a, sin, bank } = await vancouverArrival('kim');
    const draft = await draftFor(a, sin, bank);
    const operation_id = uuid();
    const hold = holdOperationLock(a.id, operation_id);
    await hold.ready;
    let pending;
    try {
      pending = await planStatus(a, operation_id);
    } finally {
      await hold.release();
    }
    assertEquals(pending.json.status, 'pending', JSON.stringify(pending.json));
    const none = await planStatus(a, operation_id);
    assertEquals(none.json.status, 'not_applied');
    assertEquals(await customRows(a.id), []);
    assertEquals(await planCount(a.id), 0);
    const w = await planApply(a, draft, { operation_id });
    const again = await planApply(a, draft, { operation_id });
    assertEquals([w.status, w.json.replayed, again.json.replayed], [200, false, true]);
    assertEquals((await customRows(a.id)).length, 1);
  },
});

Deno.test({
  name: 'an operation id reused with different items is refused and writes nothing',
  ...testOpts,
  fn: async () => {
    // Wrong if: a second request under the same identity applies something else.
    const { a, sin, bank } = await vancouverArrival('lu');
    const draft = await draftFor(a, sin, bank);
    const operation_id = uuid();
    assertEquals((await planApply(a, draft, { operation_id })).status, 200);
    const other = await planApply(a, draft, { operation_id, items: draft.items.slice(0, 2) });
    assertEquals([other.status, other.json.error], [409, 'operation_id_reused'], JSON.stringify(other.json));
    assertEquals((await plansOf(a)).json.plans.length, 1);
    assert((await customRows(a.id)).length === 1);
  },
});

/**
 * A deliberate, narrow fault: inserting a custom task with this exact title fails, as a
 * real write can. Installed and removed by the test; no product code knows about it.
 */
async function failTitle(title: string): Promise<() => Promise<void>> {
  await sql.unsafe(`create or replace function public.test364_fail_title() returns trigger language plpgsql as $f$
    begin if new.title = ${"'"}${title.replace(/'/g, "''")}${"'"} then raise exception 'injected fault'; end if; return new; end $f$`);
  await sql`create trigger test364_fail_title before insert on custom_checklist_tasks
    for each row execute function public.test364_fail_title()`;
  return async () => {
    await sql`drop trigger if exists test364_fail_title on custom_checklist_tasks`;
    await sql`drop function if exists public.test364_fail_title()`;
  };
}

Deno.test({
  name: 'a failed independent addition is reported as failed; the saved ones stay; retry runs only the failed one',
  ...testOpts,
  fn: async () => {
    // Wrong if: the reply claims blanket success, the saved addition is rolled back, the
    // plan references a task that does not exist, a retry re-runs saved work (two phone
    // tasks), or a retry of a retry writes again.
    const { a, sin, bank } = await vancouverArrival('max');
    const p = await planPrepare(a, GOAL, [...journeyItems(sin, bank), newItem('Get a transit card')]);
    const draft = p.json.plan_proposal;
    assertEquals(draft.change_count, 2);
    const heal = await failTitle('Get a transit card');
    let w;
    try {
      w = await planApply(a, draft);
    } finally {
      await heal();
    }
    assertEquals([w.status, w.json.status], [200, 'partial'], JSON.stringify(w.json));
    const results = w.json.receipt.results;
    assertEquals(results.map((r: { outcome: string }) => r.outcome), ['reused', 'reused', 'created', 'failed']);
    assertEquals([results[3].title, results[3].reason, results[3].task_ref], ['Get a transit card', 'write_failed', undefined]);
    assertEquals((await customRows(a.id)).map(r => r.title), [PHONE]);
    const plan = w.json.plan;
    assertEquals(plan.items.map((i: { task_ref: string }) => i.task_ref), [sin, bank, results[2].task_ref]);
    assertEquals(w.json.receipt.retryable, ['n2']);

    // The failed item's own identity was never used: its lookup says not applied.
    const itemStatus = await call(a, { contract_version: 1, client: { platform: 'ios' }, action: 'status',
      operation_id: results[3].item_operation_id });
    assertEquals(itemStatus.json.status, 'not_applied');

    const retryId = uuid();
    const r = await planRetry(a, w.json.operation_id, { operation_id: retryId });
    assertEquals([r.status, r.json.status], [200, 'applied'], JSON.stringify(r.json));
    assertEquals(r.json.receipt.kind, 'plan_retry');
    assertEquals(r.json.receipt.results.map((x: { key: string; outcome: string }) => [x.key, x.outcome]), [['n2', 'created']]);
    assertEquals(r.json.receipt.results[0].item_operation_id, results[3].item_operation_id);
    assertEquals((await customRows(a.id)).map(x => x.title).sort(), ['Get a transit card', PHONE]);
    assertEquals(r.json.plan.items.map((i: { task_ref: string }) => i.task_ref),
      [sin, bank, results[2].task_ref, r.json.receipt.results[0].task_ref]);

    // Same retry id: replay. New retry id: nothing is left to retry.
    const replay = await planRetry(a, w.json.operation_id, { operation_id: retryId });
    assertEquals([replay.status, replay.json.replayed], [200, true]);
    const nothing = await planRetry(a, w.json.operation_id);
    assertEquals([nothing.status, nothing.json.reason], [422, 'nothing_to_retry'], JSON.stringify(nothing.json));
    assertEquals((await customRows(a.id)).length, 2);
    assertEquals((await planStatus(a, w.json.operation_id)).json.receipt.retryable, []);
  },
});

Deno.test({
  name: 'when the plan itself cannot be saved, no addition is written',
  ...testOpts,
  fn: async () => {
    // Wrong if: an addition (a dependent of the plan approval) is saved while the plan
    // and its receipt are not.
    const { a, sin, bank } = await vancouverArrival('ned');
    const draft = await draftFor(a, sin, bank);
    const operation_id = uuid();
    await sql.unsafe(`create or replace function public.test364_fail_plan() returns trigger language plpgsql as $f$
      begin raise exception 'injected plan fault'; end $f$`);
    await sql`create trigger test364_fail_plan before insert on companion_plans for each row execute function public.test364_fail_plan()`;
    let w;
    try {
      w = await planApply(a, draft, { operation_id });
    } finally {
      await sql`drop trigger if exists test364_fail_plan on companion_plans`;
      await sql`drop function if exists public.test364_fail_plan()`;
    }
    assertEquals(w.status, 500, JSON.stringify(w.json));
    assertEquals(await customRows(a.id), []);
    assertEquals(await planCount(a.id), 0);
    // Nothing was recorded: the approval is still open and the same id can try again.
    assertEquals((await planStatus(a, operation_id)).json.status, 'not_applied');
    assertEquals((await planApply(a, draft, { operation_id })).status, 200);
  },
});

Deno.test({ name: 'cleanup', ...testOpts, fn: async () => { await sql.end(); } });
