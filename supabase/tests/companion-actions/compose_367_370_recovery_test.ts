// Added after the composition correction. This is a regression test, not test-first proof.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import {
  apply, approved, confirmedApproval, detailsOf, detailUpdate, existingCustomTask,
  existingItem, migrate, newAccount, openGate, pendingReminder, planApply, planPrepare,
  plansOf, prepare, proposalOf, ready, rememberedBy, reminderRow, status, stepCreate,
  stepRows, taskOf, taskRemove, testOpts, undo,
} from './support.ts';

await ready();

Deno.test({
  name: 'combined detail and removal receipts, retained steps and open drafts survive the full reverse rollback without restarting reminders',
  ...testOpts,
  fn: async () => {
    // Fails on lost identities, an implicit task restore, stale approval, new retry write
    // or a restarted reminder. Current task revisions can change under the accepted rollback.
    const owner = await newAccount('compose-recovery');
    const { ref } = await existingCustomTask(owner, 'Compare phone plans');
    const other = await existingCustomTask(owner, 'Compare transit passes');
    const remembered = await rememberedBy(owner, 'I prefer Friday appointments');
    const [detail] = await detailsOf(owner);
    const edited = await apply(owner, [detailUpdate(String(detail.detail_id), 'I prefer Saturday appointments', 1)]);
    assertEquals(edited.status, 200, JSON.stringify(edited.json));
    const detailDraft = await prepare(owner, { type: 'detail.create', text: 'I prefer phone calls' },
      { source: { conversation_id: remembered.conversation_id } });
    assertEquals(detailDraft.status, 200, JSON.stringify(detailDraft.json));
    const planDraft = await planPrepare(owner, 'First week', [existingItem(ref)]);
    const plan = await planApply(owner, planDraft.json.plan_proposal);
    assertEquals(plan.status, 200, JSON.stringify(plan.json));
    assertEquals((await apply(owner, [stepCreate(ref, ['Check prices'])])).status, 200);
    const steps = await stepRows(owner.id, ref);
    const reminder = await pendingReminder(owner.id, ref);
    const review = (await prepare(owner, taskRemove(ref, (await taskOf(owner, ref)).revision))).json.proposal;
    const removed = await apply(owner, review.operations, { authorization: confirmedApproval(review) });
    assertEquals(removed.status, 200, JSON.stringify(removed.json));
    const open = (await prepare(owner, taskRemove(other.ref, 1))).json.proposal;
    const beforeDetails = await detailsOf(owner);
    const beforeReceipt = (await status(owner, edited.json.operation_id)).json.receipt;
    await migrate('down');
    await migrate('up');
    await openGate();
    assertEquals(await detailsOf(owner), beforeDetails);
    assertEquals((await status(owner, edited.json.operation_id)).json.receipt, beforeReceipt);
    assertEquals((await status(owner, removed.json.operation_id)).json.receipt.operation_id, removed.json.operation_id);
    assertEquals((await taskOf(owner, ref)).removed, true);
    assertEquals((await plansOf(owner)).json.plans[0].items[0].task_ref, ref);
    assertEquals(await stepRows(owner.id, ref), steps);
    assertEquals(await reminderRow(reminder), { status: 'cancelled', cancelled_reason: 'task_removed' });
    const replay = await apply(owner, review.operations,
      { operation_id: removed.json.operation_id, authorization: confirmedApproval(review) });
    assertEquals([replay.status, replay.json.replayed], [200, true]);
    const restoredOpen = (await proposalOf(owner, open.proposal_id)).json.proposal;
    assert(restoredOpen.proposal_revision > open.proposal_revision);
    assertEquals((await apply(owner, open.operations, { authorization: confirmedApproval(open) })).status, 403);
    const restoredDetailDraft = (await proposalOf(owner, detailDraft.json.proposal.proposal_id)).json.proposal;
    assert(restoredDetailDraft.proposal_revision > detailDraft.json.proposal.proposal_revision);
    assertEquals((await apply(owner, detailDraft.json.proposal.operations,
      { authorization: approved(detailDraft.json.proposal) })).status, 403);
    const restore = await undo(owner, removed.json.operation_id);
    assertEquals(restore.status, 409, 'full rollback changes task revisions and requires a reviewed restore');
    const applied = await apply(owner, restore.json.proposal.operations, { authorization: approved(restore.json.proposal) });
    assertEquals(applied.status, 200, JSON.stringify(applied.json));
    assertEquals((await taskOf(owner, ref)).removed, false);
    assertEquals((await detailsOf(owner)).map(d => d.text), ['I prefer Saturday appointments']);
    assertEquals((await reminderRow(reminder)).status, 'cancelled');
  },
});
