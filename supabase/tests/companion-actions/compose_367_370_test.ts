// Added after the client text merge and before the shared SQL correction.
// Fails if #367 loses saved details, receipts, account isolation or retained work.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import {
  apply, approved, confirmedApproval, conversationActions, conversationWith, detailsOf,
  detailUpdate, existingCustomTask, existingItem, newAccount, pendingReminder, planApply,
  planPrepare, plansOf, prepare, read, ready, reminderRow, status, stepCreate, stepDone,
  stepRows, stepsOf, taskOf, taskRemove, testOpts, undo, uuid,
} from './support.ts';

await ready();

Deno.test({
  name: 'approved saved detail and plan task removal retain exact receipts, replay, steps and account boundaries together',
  ...testOpts,
  fn: async () => {
    const owner = await newAccount('compose367370');
    const stranger = await newAccount('compose367370-other');
    const { ref } = await existingCustomTask(owner, 'Compare phone plans');
    const source = await conversationWith(owner, 'assistant', 'You prefer Friday appointments.');
    const draft = await prepare(owner, { type: 'detail.create', text: 'I prefer Friday appointments' },
      { source: { conversation_id: source.conversation_id, message_id: source.message_id } });
    assertEquals(draft.status, 200, JSON.stringify(draft.json));
    assertEquals(await detailsOf(owner), [], 'preparation saved an unapproved detail');
    const saved = await apply(owner, draft.json.proposal.operations, { authorization: approved(draft.json.proposal) });
    assertEquals(saved.status, 200, JSON.stringify(saved.json));
    const [detail] = await detailsOf(owner);
    assertEquals([detail.text, detail.revision], ['I prefer Friday appointments', 1]);
    const edited = await apply(owner, [detailUpdate(String(detail.detail_id), 'I prefer Saturday appointments', 1)]);
    assertEquals(edited.status, 200, JSON.stringify(edited.json));
    assertEquals(edited.json.receipt.detail, {
      detail_id: detail.detail_id, text: 'I prefer Saturday appointments', before_text: 'I prefer Friday appointments', removed: false,
    });
    const planDraft = await planPrepare(owner, 'First week', [existingItem(ref)]);
    assertEquals(planDraft.status, 200, JSON.stringify(planDraft.json));
    const plan = await planApply(owner, planDraft.json.plan_proposal);
    assertEquals(plan.status, 200, JSON.stringify(plan.json));
    const planId = plan.json.receipt.plan_id;
    assertEquals((await apply(owner, [stepCreate(ref, ['Compare prepaid prices'])])).status, 200);
    assertEquals((await apply(owner, [stepCreate(ref, ['Check coverage'])])).status, 200);
    const first = (await stepsOf(owner, ref))[0];
    assertEquals((await apply(owner, [stepDone(first.step_id, true, first.revision)])).status, 200);
    const stepsBefore = await stepRows(owner.id, ref);
    const reminder = await pendingReminder(owner.id, ref);
    const review = await prepare(owner, taskRemove(ref, (await taskOf(owner, ref)).revision),
      { source: { conversation_id: source.conversation_id, message_id: source.message_id } });
    assertEquals(review.status, 200, JSON.stringify(review.json));
    assertEquals(review.json.proposal.context.plans, [{ plan_id: planId, goal: 'First week' }]);
    const removalId = uuid();
    const request = { operation_id: removalId, authorization: confirmedApproval(review.json.proposal) };
    const [removed, replay] = await Promise.all([
      apply(owner, review.json.proposal.operations, request), apply(owner, review.json.proposal.operations, request),
    ]);
    assertEquals([removed.status, replay.status], [200, 200]);
    assertEquals([removed.json.replayed, replay.json.replayed].sort(), [false, true]);
    assertEquals(removed.json.receipt, replay.json.receipt);
    assertEquals([removed.json.receipt.operation_type, removed.json.receipt.plans,
      removed.json.receipt.steps_kept, removed.json.receipt.reminders_stopped],
      ['task.remove', [{ plan_id: planId, goal: 'First week' }], 2, 1]);
    assertEquals((await status(owner, removalId)).json.receipt, removed.json.receipt);
    assertEquals((await status(owner, edited.json.operation_id)).json.receipt, edited.json.receipt);
    assertEquals((await taskOf(owner, ref)).removed, true);
    assertEquals(await stepRows(owner.id, ref), stepsBefore);
    const conversation = await conversationActions(owner, source.conversation_id);
    assertEquals(conversation.status, 200, JSON.stringify(conversation.json));
    assertEquals(conversation.json.proposals.map((p: { kind: string }) => p.kind), ['task_remove']);
    assertEquals(conversation.json.detail_proposals.map((p: { kind: string }) => p.kind), ['detail_create']);
    assertEquals(await detailsOf(stranger), []);
    assertEquals((await read(stranger)).json.tasks.some((t: { task_ref: string }) => t.task_ref === ref), false);
    assertEquals((await conversationActions(stranger, source.conversation_id)).status, 404);
    for (const operation of [removalId, edited.json.operation_id]) {
      assertEquals((await status(stranger, operation)).json.status, 'not_applied');
      assertEquals((await undo(stranger, operation)).status, 404);
    }
    assert([403, 404, 409].includes((await apply(stranger,
      [detailUpdate(String(detail.detail_id), 'other account', 2)])).status));
    const restored = await undo(owner, removalId);
    assertEquals(restored.status, 200, JSON.stringify(restored.json));
    assertEquals(restored.json.receipt.undo_of, removalId);
    assertEquals((await taskOf(owner, ref)).removed, false);
    assertEquals(await stepRows(owner.id, ref), stepsBefore);
    assertEquals((await plansOf(owner)).json.plans[0].items[0].task_ref, ref);
    assertEquals(await reminderRow(reminder), { status: 'cancelled', cancelled_reason: 'task_removed' });
    assertEquals((await detailsOf(owner)).map(d => [d.text, d.revision]), [['I prefer Saturday appointments', 2]]);
    const detailUndo = await undo(owner, edited.json.operation_id);
    assertEquals(detailUndo.status, 200, JSON.stringify(detailUndo.json));
    assertEquals((await detailsOf(owner)).map(d => [d.text, d.revision]), [['I prefer Friday appointments', 3]]);
  },
});
