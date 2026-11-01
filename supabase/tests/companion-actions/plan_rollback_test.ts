// Rollback of the settlement plan migration (mobile-app#364), alone and with the #363 and
// #361 rollbacks, through the public request boundary. The accepted policy holds:
// legacy columns stay authoritative, operation identity survives a rollback and a
// re-application, nothing runs from an outdated approval, and earlier slices keep
// working. Each test names the observation that would prove the behavior wrong.
import { assertEquals } from 'jsr:@std/assert@1';
import { draftFor, draftItems, PHONE, vancouverArrival } from './planSupport.ts';
import {
  apply, approved, checklistTitles, createTask, migrate, migrate364, openGate, planApply, planProposal, planRevise,
  planStatus, planUndo, plansOf, prepare, read, ready, setState, sql, testOpts, undo,
} from './support.ts';

await ready();

async function planWork(label: string) {
  await ready(); // each test starts from the full schema, whatever the last one left
  const { a, sin, bank } = await vancouverArrival(label);
  const saved = await draftFor(a, sin, bank);
  const w = await planApply(a, saved);
  assertEquals(w.status, 200, JSON.stringify(w.json));
  const second = await draftFor(a, sin, bank);
  const open = (await planRevise(a, second.plan_proposal_id, 1, draftItems(second.items).reverse())).json.plan_proposal;
  return { a, sin, bank, saved, w, open, phone: w.json.receipt.results[2] };
}

Deno.test({
  name: 'rolling back only #364 refuses plan actions, keeps #361/#363 working and keeps added tasks; re-application restores plans',
  ...testOpts,
  fn: async () => {
    // Wrong if: after the rollback a plan request succeeds or errors with 500, a #361
    // control or #363 draft stops working, or an added task disappears; or after
    // re-applying, the plan, its receipt, its Undo or the open draft's review state is lost.
    const { a, sin, w, open, phone } = await planWork('gil');
    await migrate364('down');
    await openGate();
    const refused = await plansOf(a);
    assertEquals([refused.status, refused.json.error], [503, 'feature_unavailable'], JSON.stringify(refused.json));
    assertEquals((await planApply(a, open)).status, 503);
    const s = (await read(a)).json.tasks.find((t: { task_ref: string }) => t.task_ref === sin);
    assertEquals((await apply(a, [setState(sin, 'in_progress', s.revision)])).status, 200);
    const d = (await prepare(a, createTask('Get a transit card'))).json.proposal;
    assertEquals((await apply(a, d.operations, { authorization: approved(d) })).status, 200);
    assertEquals((await checklistTitles(a)).sort(), ['Get a transit card', PHONE]);

    await migrate364('up');
    await openGate();
    const plans = (await plansOf(a)).json;
    assertEquals(plans.plans.length, 1, JSON.stringify(plans));
    assertEquals(plans.plans[0].items.map((i: { task_ref: string }) => i.task_ref).includes(phone.task_ref), true);
    assertEquals(plans.plans[0].receipt.operation_id, w.json.operation_id);
    assertEquals((await planStatus(a, w.json.operation_id)).json.status, 'applied');
    // An approval captured before the rollback is not used: the open draft asks for review again.
    assertEquals((await planApply(a, open)).status, 403);
    const restored = (await planProposal(a, open.plan_proposal_id)).json.plan_proposal;
    assertEquals([restored.status, restored.review_reason, restored.proposal_revision], ['draft', 'restored', 3]);
    const u = await planUndo(a, w.json.operation_id);
    assertEquals(u.status, 200, JSON.stringify(u.json));
  },
});

Deno.test({
  name: 'a full rollback and re-application keeps plan identity: a retried approval replays and adds nothing',
  ...testOpts,
  fn: async () => {
    // Wrong if: the retry after re-application saves a second plan or task, the lookup
    // forgets the operation, or the task's own Undo is lost (or applies a stale revision).
    const { a, saved, w, phone } = await planWork('hel');
    await migrate('down');
    assertEquals(await checklistTitles(a), [PHONE]);
    await migrate('up');
    await openGate();
    const retry = await planApply(a, saved, { operation_id: w.json.operation_id });
    assertEquals([retry.status, retry.json.replayed], [200, true], JSON.stringify(retry.json));
    assertEquals((await plansOf(a)).json.plans.length, 1);
    const [{ n }] = await sql`select count(*)::int n from custom_checklist_tasks where user_id = ${a.id}`;
    assertEquals(n, 1);
    // The task's own Undo is still known. By the accepted #361 rule every revision held
    // from before a full rollback is stale, so it is offered as a reviewed change.
    const own = await undo(a, phone.item_operation_id, { authorization: { kind: 'ui_control', removal_confirmed: true } });
    assertEquals([own.status, own.json.error], [409, 'undo_conflict'], JSON.stringify(own.json));
  },
});

Deno.test({ name: 'cleanup', ...testOpts, fn: async () => { await migrate('up').catch(() => {}); await sql.end(); } });
