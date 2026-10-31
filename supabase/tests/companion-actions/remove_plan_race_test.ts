// A removal review names the saved plans that refer to the task (mobile-app#367). A plan
// write that adds a reference to that task and a removal of it must not interleave: the
// plan writer and the removal are ordered on the task, so either the plan is saved first
// and the removal needs a new review that names it, or the removal commits first and the
// plan approval needs a new review that shows the task as removed. Plan writes for other
// tasks and removals of other tasks are not ordered with them (no account-wide lock).
//
// Real local stack, public request boundary. A test-installed trigger pauses one write of
// one fixture account inside its transaction, on an advisory lock the test holds; it
// changes no product function. Waits are observed in pg_stat_activity (the waiting
// backend and the backend that blocks it), never inferred from reply order.
// Each test names the observation that would prove the behavior wrong.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { partialPlan, PHONE } from './planSupport.ts';
import {
  apply, confirmedApproval, existingCustomTask, existingItem, holdOperationLock, newAccount, planApply,
  planPrepare, planRetry, planRevise, plansOf, prepare, ready, sql, taskOf, taskRemove, testOpts, uuid,
  waitForBlocked,
} from './support.ts';

await ready();

type Json = Record<string, unknown>;

/** The queries of the backends that block a backend waiting on a lock whose query matches `waiter`. */
async function blockersOf(waiter: string): Promise<string[]> {
  const rows = await sql`select b.query from pg_stat_activity w
      cross join lateral unnest(pg_blocking_pids(w.pid)) bp(pid)
      join pg_stat_activity b on b.pid = bp.pid
     where w.pid <> pg_backend_pid() and w.wait_event_type = 'Lock' and w.query ilike ${waiter}`;
  return rows.map(r => r.query as string);
}

/**
 * Pauses one statement of one account inside its transaction until release(): a BEFORE
 * trigger waits for an advisory lock the test holds. `when` is the trigger's condition.
 */
async function pauseWrite(name: string, table: string, events: string, when: string) {
  const gate = uuid();
  await sql.unsafe(`create function public.${name}() returns trigger language plpgsql as $f$
    begin
      if ${when} then
        perform pg_advisory_xact_lock(public.companion_op_lock_key(new.user_id, '${gate}'::uuid));
      end if;
      return new;
    end $f$;
    create trigger ${name} before ${events} on public.${table} for each row execute function public.${name}();`);
  return { gate, drop: () => sql.unsafe(`drop trigger if exists ${name} on public.${table}; drop function if exists public.${name}();`) };
}

/** pauseWrite for companion_plan_tasks, which has no user_id: the trigger reads it from the plan. */
async function pausePlanReference(name: string, userId: string, taskRef: string) {
  const gate = uuid();
  await sql.unsafe(`create function public.${name}() returns trigger language plpgsql as $f$
    begin
      if new.task_ref = '${taskRef}' and exists (select 1 from public.companion_plans p
                                                  where p.id = new.plan_id and p.user_id = '${userId}') then
        perform pg_advisory_xact_lock(public.companion_op_lock_key('${userId}'::uuid, '${gate}'::uuid));
      end if;
      return new;
    end $f$;
    create trigger ${name} before insert on public.companion_plan_tasks for each row execute function public.${name}();`);
  return { gate, drop: () => sql.unsafe(`drop trigger if exists ${name} on public.companion_plan_tasks; drop function if exists public.${name}();`) };
}

const goals = (plans: Json[]) => plans.map(p => p.goal).sort();

Deno.test({
  name: 'a plan approval naming a task waits for its removal in progress, then needs a new review; other plans do not wait',
  ...testOpts,
  fn: async () => {
    // Wrong if: the relevant plan approval does not wait for the removal (it saves a
    // reference the removal review never named), the removal receipt names a plan that was
    // not saved before it, a plan for another task waits for this removal, or after the
    // removal the old plan approval saves a reference to the removed task.
    const a = await newAccount('race-removal-first');
    const { ref } = await existingCustomTask(a, 'Get a phone plan');
    const other = await existingCustomTask(a, 'Buy a transit pass');
    const review = (await prepare(a, taskRemove(ref, 1))).json.proposal;
    assertEquals(review.context.plans, []);
    const phone = (await planPrepare(a, 'Phone first', [existingItem(ref)])).json.plan_proposal;
    const transit = (await planPrepare(a, 'Transit only', [existingItem(other.ref)])).json.plan_proposal;
    const pause = await pauseWrite('test367_pause_removal', 'custom_checklist_tasks', 'update',
      `new.user_id = '${a.id}' and old.removed_at is null and new.removed_at is not null`);
    const held = holdOperationLock(a.id, pause.gate);
    await held.ready;
    const removal = apply(a, review.operations, { authorization: confirmedApproval(review) });
    let plan: ReturnType<typeof planApply> | null = null;
    try {
      assert(await waitForBlocked(1, '%companion_apply_actions%') >= 1, 'the removal never reached its write');
      const unrelated = await planApply(a, transit);
      assertEquals(unrelated.status, 200, `a plan for another task waited or failed: ${JSON.stringify(unrelated.json)}`);
      plan = planApply(a, phone);
      const waiting = await waitForBlocked(1, '%companion_plan_apply%', 2000);
      const blockers = await blockersOf('%companion_plan_apply%');
      // Read in the middle: the plan is not saved and the task is not removed yet.
      const middle = { plans: goals((await plansOf(a)).json.plans), removed: (await taskOf(a, ref))?.removed };
      console.log(JSON.stringify({ waiting, blockers: blockers.map(q => q.match(/companion_[a-z_]+/)?.[0]), middle }));
      assertEquals(waiting, 1, 'the plan approval did not wait for the removal in progress');
      assert(blockers.some(q => q.includes('companion_apply_actions')), `blocked by: ${blockers.join(' | ')}`);
      assertEquals(middle, { plans: ['Transit only'], removed: false });
    } finally {
      await held.release();
      const r = await removal;
      const p = plan ? await plan : null;
      await pause.drop();
      console.log(JSON.stringify({ removal: [r.status, r.json.error ?? null, r.json.receipt?.plans ?? null],
        plan: p && [p.status, p.json.error ?? null] }));
    }
    const done = await removal;
    assertEquals([done.status, done.json.receipt.plans], [200, []], JSON.stringify(done.json));
    const p = await plan!;
    assertEquals([p.status, p.json.error], [409, 'needs_review'], JSON.stringify(p.json));
    const revised = p.json.plan_proposal;
    assertEquals(revised.context.existing.map((x: Json) => [x.task_ref, x.available]), [[ref, false]]);
    assertEquals(goals((await plansOf(a)).json.plans), ['Transit only']);
    assertEquals((await taskOf(a, ref))?.removed, true);
  },
});

Deno.test({
  name: 'a removal approval waits for a plan approval naming the task, then needs a new review that names the plan',
  ...testOpts,
  fn: async () => {
    // Wrong if: the removal does not wait for the plan write in progress, removes the task
    // with a receipt that omits the plan saved just before it, or another task's removal
    // waits for this plan. After the new review, approval removes and names the plan.
    const a = await newAccount('race-plan-first');
    const { ref } = await existingCustomTask(a, 'Get a phone plan');
    const other = await existingCustomTask(a, 'Buy a transit pass');
    const review = (await prepare(a, taskRemove(ref, 1))).json.proposal;
    const otherReview = (await prepare(a, taskRemove(other.ref, 1))).json.proposal;
    assertEquals(review.context.plans, []);
    const phone = (await planPrepare(a, 'Phone first', [existingItem(ref)])).json.plan_proposal;
    const pause = await pausePlanReference('test367_pause_plan_ref', a.id, ref);
    const held = holdOperationLock(a.id, pause.gate);
    await held.ready;
    const plan = planApply(a, phone);
    let removal: ReturnType<typeof apply> | null = null;
    try {
      assert(await waitForBlocked(1, '%companion_plan_apply%') >= 1, 'the plan approval never reached its write');
      const unrelated = await apply(a, otherReview.operations, { authorization: confirmedApproval(otherReview) });
      assertEquals(unrelated.status, 200, `another task's removal waited or failed: ${JSON.stringify(unrelated.json)}`);
      removal = apply(a, review.operations, { authorization: confirmedApproval(review) });
      const waiting = await waitForBlocked(1, '%companion_apply_actions%', 2000);
      const blockers = await blockersOf('%companion_apply_actions%');
      const middle = { plans: goals((await plansOf(a)).json.plans), removed: (await taskOf(a, ref))?.removed };
      console.log(JSON.stringify({ waiting, blockers: blockers.map(q => q.match(/companion_[a-z_]+/)?.[0]), middle }));
      assertEquals(waiting, 1, 'the removal did not wait for the plan approval in progress');
      assert(blockers.some(q => q.includes('companion_plan_apply')), `blocked by: ${blockers.join(' | ')}`);
      assertEquals(middle, { plans: [], removed: false });
    } finally {
      await held.release();
      const p = await plan;
      const r = removal ? await removal : null;
      await pause.drop();
      console.log(JSON.stringify({ plan: [p.status, p.json.error ?? null],
        removal: r && [r.status, r.json.error ?? null, r.json.receipt?.plans ?? null] }));
    }
    const saved = await plan;
    assertEquals(saved.status, 200, JSON.stringify(saved.json));
    const planId = saved.json.plan.plan_id;
    const r = await removal!;
    assertEquals([r.status, r.json.error], [409, 'needs_review'], JSON.stringify(r.json));
    const next = r.json.proposal;
    assertEquals([next.previous_context.plans, next.context.plans], [[], [{ plan_id: planId, goal: 'Phone first' }]]);
    assertEquals((await taskOf(a, ref))?.removed, false);
    const old = await apply(a, review.operations, { authorization: confirmedApproval(review) });
    assertEquals(old.status, 403, `the earlier approval removed: ${JSON.stringify(old.json)}`);
    const ok = await apply(a, next.operations, { authorization: confirmedApproval(next) });
    assertEquals([ok.status, ok.json.receipt?.plans], [200, [{ plan_id: planId, goal: 'Phone first' }]], JSON.stringify(ok.json));
  },
});

Deno.test({
  name: 'an approved plan retry review that references an existing task waits for its removal, then needs a new review',
  ...testOpts,
  fn: async () => {
    // Wrong if: the reviewed retry (the other plan writer that adds a reference to an
    // existing task) saves the reference while the task's removal is in progress, or the
    // plan then refers to the removed task.
    const { a, planOp } = await partialPlan('race-retry');
    const mine = await existingCustomTask(a, PHONE);
    const r = await planRetry(a, planOp);
    assertEquals(r.status, 200, JSON.stringify(r.json));
    const review = (await plansOf(a)).json.plans[0].review;
    const chosen = (await planRevise(a, review.plan_proposal_id, review.proposal_revision,
      [{ kind: 'existing', task_ref: mine.ref }])).json.plan_proposal;
    const removalReview = (await prepare(a, taskRemove(mine.ref, 1))).json.proposal;
    assertEquals(removalReview.context.plans, []);
    const pause = await pauseWrite('test367_pause_removal_retry', 'custom_checklist_tasks', 'update',
      `new.user_id = '${a.id}' and old.removed_at is null and new.removed_at is not null`);
    const held = holdOperationLock(a.id, pause.gate);
    await held.ready;
    const removal = apply(a, removalReview.operations, { authorization: confirmedApproval(removalReview) });
    let approve: ReturnType<typeof planApply> | null = null;
    try {
      assert(await waitForBlocked(1, '%companion_apply_actions%') >= 1, 'the removal never reached its write');
      approve = planApply(a, chosen);
      const waiting = await waitForBlocked(1, '%companion_plan_apply%', 2000);
      const blockers = await blockersOf('%companion_plan_apply%');
      console.log(JSON.stringify({ waiting, blockers: blockers.map(q => q.match(/companion_[a-z_]+/)?.[0]) }));
      assertEquals(waiting, 1, 'the reviewed retry did not wait for the removal in progress');
      assert(blockers.some(q => q.includes('companion_apply_actions')), `blocked by: ${blockers.join(' | ')}`);
    } finally {
      await held.release();
      const rr = await removal;
      const p = approve ? await approve : null;
      await pause.drop();
      console.log(JSON.stringify({ removal: [rr.status, rr.json.receipt?.plans ?? null], retry: p && [p.status, p.json.error ?? null] }));
    }
    assertEquals([(await removal).status, (await removal).json.receipt.plans], [200, []]);
    const p = await approve!;
    assertEquals([p.status, p.json.error], [409, 'needs_review'], JSON.stringify(p.json));
    const plan = (await plansOf(a)).json.plans[0];
    assert(!plan.items.some((i: Json) => i.task_ref === mine.ref), 'the plan refers to the removed task');
  },
});
