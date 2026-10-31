// More than one revised retry review of the same saved plan (mobile-app#364, SPEC review
// r2 R2-SPEC-1). Two failed additions can need separate reviews: one because a same-title
// task appeared, a later one because the profile changed. Every unfinished review must
// stay reachable from a fresh plan read (a restart or a new conversation) and be approved,
// edited or closed on its own, through the public request boundary of the real local
// stack. A test-installed trigger makes the chosen inserts fail; no product code knows it.
// Each test names the observation that would prove the behavior wrong.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { PHONE, vancouverArrival } from './planSupport.ts';
import {
  type Account, customRows, existingCustomTask, existingItem, newAccount, newItem, planApply, planCancel, planPrepare,
  planProposal, planRetry, planRevise, plansOf, planStatus, planUndo, read, ready, setProfile, sql, testOpts, undo, uuid,
} from './support.ts';

await ready();

type Json = Record<string, unknown>;
const SAVED = 'Arrange transport';
const LIBRARY = 'Get a library card';
const outcomes = (results: Json[]) => results.map(r => [r.key, r.outcome]);
const reviewIds = (plan: { reviews?: Json[] }) => (plan.reviews ?? []).map((r: Json) => r.plan_proposal_id);
const openReviews = (plan: { reviews?: Json[] }) => (plan.reviews ?? []).filter((r: Json) => r.status === 'draft');

/** Inserts of these titles fail until the returned function sets other titles or heals. */
async function failTitles(titles: string[]): Promise<(next?: string[]) => Promise<void>> {
  const install = async (list: string[]) => {
    const names = list.map(t => `'${t.replace(/'/g, "''")}'`).join(', ') || 'null';
    await sql.unsafe(`create or replace function public.test364_fail_titles() returns trigger language plpgsql as $f$
      begin if new.title in (${names}) then raise exception 'injected fault'; end if; return new; end $f$`);
  };
  await install(titles);
  await sql`create trigger test364_fail_titles before insert on custom_checklist_tasks
    for each row execute function public.test364_fail_titles()`;
  return async (next?: string[]) => {
    if (next) return install(next);
    await sql`drop trigger if exists test364_fail_titles on custom_checklist_tasks`;
    await sql`drop function if exists public.test364_fail_titles()`;
  };
}

/**
 * The reviewer's sequence: SIN reused, transport saved, phone and library card failed.
 * A phone task appears elsewhere: Retry opens a phone review while the library card fails
 * again. The city changes: Retry opens a separate library-card review. Both stay open.
 */
async function twoReviews(label: string) {
  const { a, sin } = await vancouverArrival(label);
  const p = await planPrepare(a, 'Two remaining additions', [existingItem(sin), newItem(SAVED), newItem(PHONE), newItem(LIBRARY)]);
  assertEquals(p.status, 200, JSON.stringify(p.json));
  const fault = await failTitles([PHONE, LIBRARY]);
  try {
    const initial = await planApply(a, p.json.plan_proposal);
    assertEquals(outcomes(initial.json.receipt.results), [[undefined, 'reused'], ['n1', 'created'], ['n2', 'failed'], ['n3', 'failed']]);
    await fault([LIBRARY]);
    const phoneTask = await existingCustomTask(a, PHONE);
    const first = await planRetry(a, initial.json.operation_id);
    assertEquals(outcomes(first.json.receipt.results), [['n2', 'needs_review'], ['n3', 'failed']], JSON.stringify(first.json));
    await setProfile(a, { city: 'Surrey' });
    const second = await planRetry(a, initial.json.operation_id);
    assertEquals(outcomes(second.json.receipt.results), [['n3', 'needs_review']], JSON.stringify(second.json));
    return {
      a, sin, phoneTask, planOp: initial.json.operation_id as string, initial: initial.json,
      savedRef: initial.json.receipt.results[1].task_ref as string,
      phoneOp: initial.json.receipt.results[2].item_operation_id as string,
      libraryOp: initial.json.receipt.results[3].item_operation_id as string,
      phoneReview: first.json.receipt.results[0].plan_proposal_id as string,
      libraryReview: second.json.receipt.results[0].plan_proposal_id as string,
    };
  } finally {
    await fault();
  }
}
const savedTask = async (a: Account, ref: string) => (await read(a)).json.tasks.find((t: Json) => t.task_ref === ref);

Deno.test({
  name: 'a second retry review keeps the first reachable after a fresh read; each is approved on its own with its original identity',
  ...testOpts,
  fn: async () => {
    // Wrong if: a fresh plan read omits either open review, shows them in another order or
    // with other items, offers Retry for an addition waiting in a review, approving one
    // closes, changes or approves the other, the first review is approved under the city it
    // was reviewed with, an addition gets a new identity, or the saved addition changes.
    const f = await twoReviews('mra');
    const savedBefore = await savedTask(f.a, f.savedRef);

    const plan = (await plansOf(f.a, 'web')).json.plans[0];
    assertEquals(reviewIds(plan), [f.phoneReview, f.libraryReview], 'an unfinished review is not reachable from the saved plan');
    assertEquals(plan.receipt.retryable, []);
    const [phone, library] = plan.reviews;
    assertEquals([phone.status, phone.kind, phone.retry_of, phone.plan_id], ['draft', 'retry', f.planOp, plan.plan_id]);
    assertEquals(phone.items.map((i: Json) => [i.kind, i.key, i.title, i.include]), [['new', 'n2', PHONE, true]]);
    assertEquals([phone.unresolved, phone.context.matches.n2.map((m: Json) => m.task_ref)], [['n2'], [f.phoneTask.ref]]);
    assertEquals([library.status, library.retry_of], ['draft', f.planOp]);
    assertEquals(library.items.map((i: Json) => [i.kind, i.key, i.title, i.include]), [['new', 'n3', LIBRARY, true]]);
    assertEquals([library.previous_context.profile.city, library.context.profile.city], ['Vancouver', 'Surrey']);

    // The phone review was made before the city changed: its approval needs a new review.
    const stale = await planApply(f.a, phone);
    assertEquals([stale.status, stale.json.error], [409, 'needs_review'], JSON.stringify(stale.json));
    const phoneNext = stale.json.plan_proposal;
    assertEquals([phoneNext.proposal_revision, phoneNext.review_reason], [phone.proposal_revision + 1, 'context_changed']);
    assertEquals([phoneNext.previous_context.profile.city, phoneNext.context.profile.city], ['Vancouver', 'Surrey']);
    assertEquals(await customRows(f.a.id).then(r => r.length), 2);
    let now = (await plansOf(f.a)).json.plans[0];
    assertEquals(openReviews(now).map((r: Json) => [r.plan_proposal_id, r.proposal_revision]),
      [[f.phoneReview, phoneNext.proposal_revision], [f.libraryReview, library.proposal_revision]]);

    // The user keeps their own phone task instead of adding another.
    const use = await planRevise(f.a, phone.plan_proposal_id, phoneNext.proposal_revision, [{ kind: 'existing', task_ref: f.phoneTask.ref }]);
    assertEquals(use.status, 200, JSON.stringify(use.json));
    const phoneOk = await planApply(f.a, use.json.plan_proposal);
    assertEquals(phoneOk.status, 200, JSON.stringify(phoneOk.json));
    assertEquals(phoneOk.json.receipt.results.map((x: Json) => [x.key, x.outcome, x.task_ref]), [['n2', 'reused', f.phoneTask.ref]]);
    now = (await plansOf(f.a)).json.plans[0];
    assertEquals(openReviews(now).map((r: Json) => [r.plan_proposal_id, r.proposal_revision, r.items]),
      [[f.libraryReview, library.proposal_revision, library.items]], 'approving one review changed the other');

    const libraryOk = await planApply(f.a, library);
    assertEquals(libraryOk.status, 200, JSON.stringify(libraryOk.json));
    assertEquals(outcomes(libraryOk.json.receipt.results), [['n3', 'created']]);
    assertEquals(libraryOk.json.receipt.results[0].item_operation_id, f.libraryOp, 'the addition lost its identity');

    now = (await plansOf(f.a)).json.plans[0];
    assertEquals(openReviews(now), []);
    assertEquals(now.items.map((i: Json) => i.task_ref),
      [f.sin, f.savedRef, f.phoneTask.ref, libraryOk.json.receipt.results[0].task_ref]);
    assertEquals(now.receipt.retryable, []);
    assertEquals(await savedTask(f.a, f.savedRef), savedBefore);
    assertEquals((await customRows(f.a.id)).map(t => t.title).sort(), [LIBRARY, SAVED, PHONE].sort());
  },
});

Deno.test({
  name: 'Not now on one review keeps the other open; only the closed addition returns to Retry, which opens one new review',
  ...testOpts,
  fn: async () => {
    // Wrong if: closing one review closes, edits or hides the other, gives the other's
    // addition to Retry, loses the closed addition, or a Retry (even two at once) writes it
    // under the old approval or opens more than one new review.
    const f = await twoReviews('mrb');
    const [phone, library] = (await plansOf(f.a)).json.plans[0].reviews;
    const closed = await planCancel(f.a, library.plan_proposal_id, library.proposal_revision);
    assertEquals(closed.status, 200, JSON.stringify(closed.json));
    let plan = (await plansOf(f.a)).json.plans[0];
    assertEquals(openReviews(plan).map((r: Json) => [r.plan_proposal_id, r.proposal_revision, r.items]),
      [[f.phoneReview, phone.proposal_revision, phone.items]]);
    assertEquals(plan.receipt.retryable, ['n3']);

    const [r1, r2] = await Promise.all([planRetry(f.a, f.planOp), planRetry(f.a, f.planOp)]);
    assertEquals([r1.status, r2.status].sort(), [200, 422], JSON.stringify([r1.json, r2.json]));
    const won = r1.status === 200 ? r1 : r2;
    assertEquals(outcomes(won.json.receipt.results), [['n3', 'needs_review']]);
    plan = (await plansOf(f.a)).json.plans[0];
    assertEquals(reviewIds(plan), [f.phoneReview, won.json.receipt.results[0].plan_proposal_id]);
    assertEquals(plan.receipt.retryable, []);
    assertEquals((await customRows(f.a.id)).map(t => t.title).sort(), [PHONE, SAVED].sort());
  },
});

Deno.test({
  name: 'two reviews approved at once each add their own task once; replays and a lost reply add nothing; an old Retry replay opens no review',
  ...testOpts,
  fn: async () => {
    // Wrong if: concurrent approvals of different reviews block, drop or duplicate an
    // addition, a repeated approval or Retry writes again or opens another review, or the
    // lookup of a lost approval does not return its saved result.
    const f = await twoReviews('mrc');
    const [phone, library] = (await plansOf(f.a)).json.plans[0].reviews;
    // Both additions as new tasks: the phone review first moves to the current city.
    const stale = await planApply(f.a, phone);
    assertEquals(stale.status, 409, JSON.stringify(stale.json));
    const asNew = await planRevise(f.a, phone.plan_proposal_id, stale.json.plan_proposal.proposal_revision,
      [{ kind: 'new', key: 'n2', include: true, confirm_new: true }]);
    assertEquals(asNew.status, 200, JSON.stringify(asNew.json));
    const phoneDraft = asNew.json.plan_proposal;
    const [opP, opL] = [uuid(), uuid()];
    const replies = await Promise.all([
      planApply(f.a, phoneDraft, { operation_id: opP }), planApply(f.a, library, { operation_id: opL }),
      planApply(f.a, phoneDraft, { operation_id: opP }), planApply(f.a, library, { operation_id: opL }),
    ]);
    assertEquals(replies.map(r => r.status), [200, 200, 200, 200], JSON.stringify(replies.map(r => r.json)));
    assertEquals(replies.filter(r => r.json.replayed === false).length, 2);
    const [p, l] = await Promise.all([planStatus(f.a, opP), planStatus(f.a, opL)]);
    assertEquals([p.json.status, outcomes(p.json.receipt.results), p.json.receipt.results[0].item_operation_id],
      ['applied', [['n2', 'created']], f.phoneOp]);
    assertEquals([l.json.status, outcomes(l.json.receipt.results), l.json.receipt.results[0].item_operation_id],
      ['applied', [['n3', 'created']], f.libraryOp]);
    const titles = (await customRows(f.a.id)).map(t => t.title);
    assertEquals(titles.filter(t => t === PHONE).length, 2, 'the user\'s own phone task plus exactly one added');
    assertEquals(titles.filter(t => t === LIBRARY).length, 1);

    // The second Retry's receipt replayed by its own identity: recorded result, no review.
    const before = (await sql`select count(*)::int n from companion_plan_proposals where user_id = ${f.a.id}`)[0].n;
    const secondRetryOp = (await sql`select operation_id::text from companion_action_receipts
      where user_id = ${f.a.id} and outcome->>'kind' = 'plan_retry' and outcome->>'plan_proposal_id' is null
      order by created_at desc limit 1`)[0].operation_id;
    const replay = await planRetry(f.a, f.planOp, { operation_id: secondRetryOp });
    assertEquals([replay.status, replay.json.replayed, outcomes(replay.json.receipt.results)], [200, true, [['n3', 'needs_review']]]);
    assertEquals((await sql`select count(*)::int n from companion_plan_proposals where user_id = ${f.a.id}`)[0].n, before);
    assertEquals((await planRetry(f.a, f.planOp)).json.reason, 'nothing_to_retry');
    assertEquals(openReviews((await plansOf(f.a)).json.plans[0]), []);
  },
});

Deno.test({
  name: 'a plan Undo closes every open review; another account reaches neither; an item Undo removes only its own task',
  ...testOpts,
  fn: async () => {
    // Wrong if: another account reads or approves either review, an item Undo removes
    // anything but its own addition or closes a review, or a review of an undone plan
    // stays open or can still add a task.
    const f = await twoReviews('mrd');
    const [phone, library] = (await plansOf(f.a)).json.plans[0].reviews;
    const b = await newAccount('mre');
    assertEquals((await plansOf(b)).json.plans, []);
    for (const r of [phone, library]) {
      assertEquals((await planProposal(b, r.plan_proposal_id)).status, 404);
      assertEquals((await planApply(b, r)).status, 403);
    }
    const libraryOk = await planApply(f.a, library);
    assertEquals(outcomes(libraryOk.json.receipt.results), [['n3', 'created']], JSON.stringify(libraryOk.json));
    const libraryRef = libraryOk.json.receipt.results[0].task_ref;
    const savedBefore = await savedTask(f.a, f.savedRef);
    const itemUndo = await undo(f.a, f.libraryOp, { authorization: { kind: 'ui_control', removal_confirmed: true } });
    assertEquals(itemUndo.status, 200, JSON.stringify(itemUndo.json));
    assert((await savedTask(f.a, libraryRef))?.removed !== false, 'the item Undo kept its task');
    assertEquals(await savedTask(f.a, f.savedRef), savedBefore);
    assertEquals(openReviews((await plansOf(f.a)).json.plans[0]).map((r: Json) => r.plan_proposal_id), [f.phoneReview]);

    const planUndone = await planUndo(f.a, f.planOp);
    assertEquals(planUndone.status, 409, 'a plan changed by a retry needs a reviewed Undo');
    const comp = planUndone.json.plan_proposal;
    const done = await planApply(f.a, comp, { authorization: {
      kind: 'approved_proposal', proposal_id: comp.plan_proposal_id, proposal_revision: comp.proposal_revision, removal_confirmed: true } });
    assertEquals(done.status, 200, JSON.stringify(done.json));
    const rows = await sql`select status from companion_plan_proposals where id in ${sql([phone.plan_proposal_id, library.plan_proposal_id])}`;
    assertEquals(rows.map(r => r.status).sort(), ['applied', 'cancelled']);
    assertEquals((await plansOf(f.a)).json.plans, []);
    const late = await planApply(f.a, phone);
    assert([403, 422].includes(late.status), JSON.stringify(late.json));
    assertEquals((await customRows(f.a.id)).filter(t => t.title === PHONE && !t.removed).length, 1, 'only the user\'s own phone task');
  },
});

Deno.test({ name: 'cleanup', ...testOpts, fn: async () => { await sql.end(); } });
