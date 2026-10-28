// Retry of a partial plan after relevant context changed (mobile-app#364, SPEC "Changed
// relevant context requires a revised proposal and new approval"), through the public
// request boundary against the real local stack. The phone addition fails through a
// test-installed trigger, the trigger is removed, then the profile changes before Retry.
// Each test names the observation that would prove the behavior wrong.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { partialPlan, PHONE } from './planSupport.ts';
import {
  call, customRows, existingCustomTask, migrate, migrate364, newAccount, openGate, planApply, planCancel, planProposal, planRetry, planRevise, plansOf,
  planStatus, planUndo, read, ready, setProfile, setState, sql, testOpts, uuid,
} from './support.ts';

await ready();

type Json = Record<string, unknown>;
const outcomes = (results: Json[]) => results.map(r => [r.key, r.outcome]);

Deno.test({
  name: 'a retry after a relevant profile change opens a durable revised review of exactly the remaining addition; approving it adds one task',
  ...testOpts,
  fn: async () => {
    // Wrong if: the retry writes the phone task under the old approval, the retry result
    // names no review, the saved plan read (as after a restart) has no review to reach,
    // the old Retry is still offered for the reviewed item, the review shows anything but
    // the failed addition with its before/current profile, approving it adds zero or two
    // tasks, uses another identity, or changes the reused tasks or the original receipt.
    const { a, sin, bank, planOp, phoneOp } = await partialPlan('ria');
    const before = (await plansOf(a)).json.plans[0];
    await setProfile(a, { city: 'Surrey' });

    const r = await planRetry(a, planOp);
    assertEquals(r.status, 200, JSON.stringify(r.json));
    assertEquals(r.json.receipt.results.map((x: Json) => [x.key, x.outcome, x.reason]), [['n1', 'needs_review', 'context_changed']]);
    const reviewId = r.json.receipt.results[0].plan_proposal_id;
    assert(typeof reviewId === 'string', 'the needs-review result names no revised proposal');
    assertEquals(await customRows(a.id), [], 'the retry wrote under the old approval');

    // A fresh read of saved plans (a restart or a new conversation) reaches the review.
    const plan = (await plansOf(a, 'web')).json.plans[0];
    assertEquals(plan.receipt.retryable, [], 'the same Retry is offered again');
    const review = plan.review;
    assert(review, 'the saved plan carries no review');
    assertEquals(
      [review.plan_proposal_id, review.kind, review.status, review.review_reason, review.change_count],
      [reviewId, 'retry', 'draft', 'context_changed', 1],
    );
    assertEquals([review.plan_id, review.retry_of], [plan.plan_id, planOp]);
    assertEquals(review.items.map((i: Json) => [i.kind, i.key, i.title, i.include]), [['new', 'n1', PHONE, true]]);
    assertEquals([review.previous_context.profile.city, review.context.profile.city], ['Vancouver', 'Surrey']);

    const ok = await planApply(a, review);
    assertEquals(ok.status, 200, JSON.stringify(ok.json));
    assertEquals([ok.json.status, ok.json.receipt.kind, ok.json.receipt.retry_of], ['applied', 'plan_retry', planOp]);
    assertEquals(outcomes(ok.json.receipt.results), [['n1', 'created']]);
    assertEquals(ok.json.receipt.results[0].item_operation_id, phoneOp, 'the addition lost its identity');
    assertEquals((await customRows(a.id)).map(t => t.title), [PHONE]);

    const after = (await plansOf(a)).json.plans[0];
    assertEquals(after.items.map((i: Json) => i.task_ref), [sin, bank, ok.json.receipt.results[0].task_ref]);
    assertEquals(
      after.items.slice(0, 2).map((i: Json) => [i.state, i.revision]),
      before.items.slice(0, 2).map((i: Json) => [i.state, i.revision]),
    );
    // The original receipt keeps its recorded meaning; the review keeps its own result.
    assertEquals(after.receipt.operation_id, planOp);
    assertEquals(after.receipt.results.map((x: Json) => x.outcome), ['reused', 'reused', 'failed']);
    assertEquals(after.receipt.retryable, []);
    assertEquals([after.review.status, after.review.receipt.operation_id], ['applied', ok.json.operation_id]);
    const [{ n }] = await sql`select count(*)::int n from companion_action_receipts
      where user_id = ${a.id} and operation_id = ${phoneOp}`;
    assertEquals(n, 1, 'the added task has no receipt of its own');
  },
});

async function openReview(label: string) {
  const fixture = await partialPlan(label);
  await setProfile(fixture.a, { city: 'Surrey' });
  const r = await planRetry(fixture.a, fixture.planOp);
  assertEquals(r.json.receipt?.results?.[0]?.outcome, 'needs_review', JSON.stringify(r.json));
  const review = (await plansOf(fixture.a)).json.plans[0].review;
  return { ...fixture, retry: r.json, review };
}
const retryDrafts = async (userId: string) =>
  (await sql`select count(*)::int n from companion_plan_proposals where user_id = ${userId} and kind = 'retry'`)[0].n;
const itemReceipts = async (userId: string, op: string) =>
  (await sql`select count(*)::int n from companion_action_receipts where user_id = ${userId} and operation_id = ${op}`)[0].n;

Deno.test({
  name: 'concurrent retries open one review; replays, a second context change, competing and lost approvals add one task',
  ...testOpts,
  fn: async () => {
    // Wrong if: two concurrent retries open two reviews or write, a replayed retry opens
    // another review, a second relevant change is approved under the earlier review, an
    // old revision still approves, concurrent or competing approvals add two tasks, or a
    // lost reply is not found by lookup.
    const { a, planOp, phoneOp } = await partialPlan('sol');
    await setProfile(a, { city: 'Surrey' });
    const [r1, r2] = await Promise.all([planRetry(a, planOp), planRetry(a, planOp)]);
    assertEquals([r1.status, r2.status].sort(), [200, 422], JSON.stringify([r1.json, r2.json]));
    const won = r1.status === 200 ? r1 : r2;
    assertEquals((r1.status === 422 ? r1 : r2).json.reason, 'nothing_to_retry');
    const replay = await planRetry(a, planOp, { operation_id: won.json.operation_id });
    assertEquals([replay.status, replay.json.replayed], [200, true]);
    assertEquals(replay.json.receipt.results[0].plan_proposal_id, won.json.receipt.results[0].plan_proposal_id);
    assertEquals(await retryDrafts(a.id), 1);

    const first = (await plansOf(a)).json.plans[0].review;
    await setProfile(a, { city: 'Burnaby' });
    const stale = await planApply(a, first);
    assertEquals([stale.status, stale.json.error], [409, 'needs_review'], JSON.stringify(stale.json));
    const next = stale.json.plan_proposal;
    assertEquals([next.proposal_revision, next.review_reason], [first.proposal_revision + 1, 'context_changed']);
    assertEquals([next.previous_context.profile.city, next.context.profile.city], ['Surrey', 'Burnaby']);
    assertEquals(await customRows(a.id), []);
    const old = await planApply(a, first);
    assertEquals([old.status, old.json.reason], [403, 'invalid_authorization'], JSON.stringify(old.json));

    const operation_id = uuid();
    const replies = await Promise.all(Array.from({ length: 6 }, () => planApply(a, next, { operation_id })));
    assertEquals(replies.map(r => r.status), [200, 200, 200, 200, 200, 200], JSON.stringify(replies.map(r => r.json)));
    assertEquals(replies.filter(r => r.json.replayed === false).length, 1);
    const competing = await planApply(a, next);
    assertEquals([competing.status, competing.json.error, competing.json.plan_proposal?.status],
      [409, 'proposal_changed', 'applied'], JSON.stringify(competing.json));
    // The reply was lost: the lookup by the approval's identity finds the saved result.
    const looked = await planStatus(a, operation_id);
    assertEquals([looked.json.status, outcomes(looked.json.receipt.results)], ['applied', [['n1', 'created']]]);
    assertEquals((await customRows(a.id)).map(t => t.title), [PHONE]);
    assertEquals(await itemReceipts(a.id, phoneOp), 1);
    // Nothing is left to retry, and the plain Retry cannot add the phone task again.
    const nothing = await planRetry(a, planOp);
    assertEquals([nothing.status, nothing.json.reason], [422, 'nothing_to_retry']);
    assertEquals((await customRows(a.id)).length, 1);
  },
});

Deno.test({
  name: 'an unrelated change since approval (reused task progress, a profile field the plan does not use) retries without a review',
  ...testOpts,
  fn: async () => {
    // Wrong if: a change the addition does not depend on blocks the retry or opens a review.
    const { a, sin, planOp } = await partialPlan('tia');
    const t = (await read(a)).json.tasks.find((x: Json) => x.task_ref === sin);
    const st = await call(a, { contract_version: 1, client: { platform: 'web' }, action: 'apply', operation_id: uuid(),
      authorization: { kind: 'ui_control' }, operations: [setState(sin, 'in_progress', t.revision)] });
    assertEquals(st.status, 200, JSON.stringify(st.json));
    await setProfile(a, { persona: 'student', stage: 2 });
    const r = await planRetry(a, planOp);
    assertEquals([r.status, outcomes(r.json.receipt.results)], [200, [['n1', 'created']]], JSON.stringify(r.json));
    assertEquals((await plansOf(a)).json.plans[0].review, null);
    assertEquals(await retryDrafts(a.id), 0);
    assertEquals((await customRows(a.id)).map(x => x.title), [PHONE]);
  },
});

Deno.test({
  name: 'a same-title task that appeared before the retry is offered in the review; choosing it references that task and adds none',
  ...testOpts,
  fn: async () => {
    // Wrong if: the retry adds a duplicate next to the user's own task, the review cannot
    // be approved until the match is resolved, or choosing the existing task adds a task
    // or puts it somewhere other than the addition's place in the plan.
    const { a, sin, bank, planOp } = await partialPlan('uma');
    const mine = await existingCustomTask(a, PHONE);
    const r = await planRetry(a, planOp);
    assertEquals(outcomes(r.json.receipt.results), [['n1', 'needs_review']], JSON.stringify(r.json));
    const review = (await plansOf(a)).json.plans[0].review;
    assertEquals(review.unresolved, ['n1']);
    assertEquals(review.context.matches.n1.map((m: Json) => m.task_ref), [mine.ref]);
    assertEquals(review.previous_context.matches.n1, []);
    const blocked = await planApply(a, review);
    assertEquals([blocked.status, blocked.json.reason], [422, 'match_unresolved'], JSON.stringify(blocked.json));
    const use = await planRevise(a, review.plan_proposal_id, review.proposal_revision, [{ kind: 'existing', task_ref: mine.ref }]);
    assertEquals(use.status, 200, JSON.stringify(use.json));
    const chosen = use.json.plan_proposal;
    assertEquals([chosen.change_count, chosen.unresolved], [0, []]);
    const ok = await planApply(a, chosen);
    assertEquals(ok.status, 200, JSON.stringify(ok.json));
    assertEquals(ok.json.receipt.results.map((x: Json) => [x.key, x.outcome, x.task_ref]), [['n1', 'reused', mine.ref]]);
    assertEquals((await customRows(a.id)).map(x => x.title), [PHONE]);
    const plan = (await plansOf(a)).json.plans[0];
    assertEquals(plan.items.map((i: Json) => i.task_ref), [sin, bank, mine.ref]);
    assertEquals(plan.receipt.retryable, []);
  },
});

Deno.test({
  name: 'Not now returns the addition to Retry; leaving it out closes it; a plan Undo closes an open review',
  ...testOpts,
  fn: async () => {
    // Wrong if: Not now loses the failed addition, Retry under the still-changed context
    // writes, a left-out addition is added or offered again, or a review of an undone plan
    // can still add a task.
    const { a, planOp, review } = await openReview('vic');
    const c = await planCancel(a, review.plan_proposal_id, review.proposal_revision);
    assertEquals(c.status, 200, JSON.stringify(c.json));
    let plan = (await plansOf(a)).json.plans[0];
    assertEquals([plan.receipt.retryable, plan.review.status], [['n1'], 'cancelled']);
    const again = await planRetry(a, planOp);
    assertEquals(outcomes(again.json.receipt.results), [['n1', 'needs_review']]);
    const second = (await plansOf(a)).json.plans[0].review;
    assert(second.plan_proposal_id !== review.plan_proposal_id);
    const out = await planRevise(a, second.plan_proposal_id, second.proposal_revision, [{ kind: 'new', key: 'n1', include: false }]);
    assertEquals(out.json.plan_proposal.change_count, 0, JSON.stringify(out.json));
    const ok = await planApply(a, out.json.plan_proposal);
    assertEquals([ok.status, outcomes(ok.json.receipt.results)], [200, [['n1', 'excluded']]], JSON.stringify(ok.json));
    plan = (await plansOf(a)).json.plans[0];
    assertEquals([plan.receipt.retryable, plan.review.status], [[], 'applied']);
    assertEquals(await customRows(a.id), []);
    assertEquals((await planRetry(a, planOp)).json.reason, 'nothing_to_retry');

    const u = await openReview('wes');
    const undo = await planUndo(u.a, u.planOp);
    assertEquals(undo.status, 200, JSON.stringify(undo.json));
    const late = await planApply(u.a, u.review);
    assert([403, 422].includes(late.status), JSON.stringify(late.json));
    assertEquals(await customRows(u.a.id), []);
    const [{ status }] = await sql`select status from companion_plan_proposals where id = ${u.review.plan_proposal_id}`;
    assertEquals(status, 'cancelled');
  },
});

Deno.test({
  name: 'another account cannot read, edit, approve, close or retry a revised review',
  ...testOpts,
  fn: async () => {
    // Wrong if: any request of account B reads A's review or changes anything of A's.
    const { a, planOp, review } = await openReview('xia');
    const b = await newAccount('yan');
    assertEquals((await planProposal(b, review.plan_proposal_id)).status, 404);
    assertEquals((await planRevise(b, review.plan_proposal_id, review.proposal_revision,
      [{ kind: 'new', key: 'n1', include: false }])).status, 404);
    assertEquals((await planCancel(b, review.plan_proposal_id, review.proposal_revision)).status, 404);
    assertEquals((await planApply(b, review)).status, 403);
    assertEquals((await planRetry(b, planOp)).status, 404);
    assertEquals((await plansOf(b)).json.plans, []);
    const mine = (await plansOf(a)).json.plans[0].review;
    assertEquals([mine.status, mine.proposal_revision, mine.items], ['draft', review.proposal_revision, review.items]);
    assertEquals(await customRows(a.id), []);
  },
});

Deno.test({
  name: 'rolling back #364 and applying it again keeps an open revised review reachable; its earlier approval is not used',
  ...testOpts,
  fn: async () => {
    // Wrong if: the review disappears or loses its plan link, the item becomes retryable
    // past the review, an approval captured before the rollback applies, or approving the
    // restored review adds anything but the one task.
    const { a, planOp, review } = await openReview('zed');
    await migrate364('down');
    await migrate364('up');
    await openGate();
    const plan = (await plansOf(a)).json.plans[0];
    assertEquals(
      [plan.review.plan_proposal_id, plan.review.status, plan.review.review_reason, plan.review.proposal_revision, plan.review.retry_of],
      [review.plan_proposal_id, 'draft', 'restored', review.proposal_revision + 1, planOp],
    );
    assertEquals(plan.receipt.retryable, []);
    assertEquals((await planApply(a, review)).status, 403);
    const ok = await planApply(a, plan.review);
    assertEquals([ok.status, outcomes(ok.json.receipt?.results ?? [])], [200, [['n1', 'created']]], JSON.stringify(ok.json));
    assertEquals((await customRows(a.id)).map(t => t.title), [PHONE]);
  },
});

Deno.test({ name: 'cleanup', ...testOpts, fn: async () => { await migrate('up').catch(() => {}); await sql.end(); } });
