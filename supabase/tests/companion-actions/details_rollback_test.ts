// Rollback and re-application of the saved-details migration (mobile-app#370), through
// the public boundary. Each test names the observation that would prove it wrong.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import {
  apply, approved, contextDetails, detailCreate, detailRows, detailsOf, detailUpdate, existingCustomTask, migrate,
  migrate370, newAccount, openGate, prepare, read, ready, rememberedBy, sql, status, testOpts, uuid,
} from './support.ts';

await ready();

Deno.test({
  name: 'rolling back stops every use of saved details; re-applying restores them, their receipts and a re-review',
  ...testOpts,
  fn: async () => {
    // Wrong if: a detail is still read into answers while rolled back, a retry after the
    // rollback writes a second detail, tasks stop being served, or re-application loses a
    // detail, its revision, its receipt identity, or lets an old approval apply.
    const a = await newAccount('details-rollback');
    const task = await existingCustomTask(a, 'Open a bank account');
    const s = await rememberedBy(a, 'I can attend appointments on Fridays');
    const id = s.receipt.detail.detail_id;
    const edit = await apply(a, [detailUpdate(id, 'I can attend appointments on Saturdays', 1)]);
    assertEquals(edit.status, 200);
    const draft = await prepare(a, detailCreate('I need an interpreter'), { source: { conversation_id: s.conversation_id } });
    assertEquals(draft.status, 200);

    await migrate370('down');
    try {
      const r = await read(a);
      assertEquals(r.status, 200, 'tasks are no longer served after the rollback');
      assert(!('details' in r.json));
      assert(r.json.tasks.some((t: { task_ref: string }) => t.task_ref === task.ref));
      const ctx = await a.client.from('companion_saved_details').select('body');
      assert(ctx.error, 'a later answer can still read saved details while rolled back');
      assertEquals((await status(a, s.operation_id)).json.status, 'not_applied');
      const retry = await apply(a, [detailCreate('I can attend appointments on Fridays')],
        { operation_id: s.operation_id, authorization: { kind: 'direct_command', message_id: s.message_id } });
      assertEquals([retry.status, retry.json.reason], [422, 'unsupported_operation']);
    } finally {
      await migrate370('up');
      await openGate();
    }

    const [d] = await detailsOf(a);
    assertEquals([d.detail_id, d.text, d.revision], [id, 'I can attend appointments on Saturdays', 2]);
    assertEquals(await contextDetails(a), ['I can attend appointments on Saturdays']);
    const looked = await status(a, s.operation_id);
    assertEquals([looked.json.status, looked.json.receipt.detail.text, looked.json.receipt.current],
      ['applied', 'I can attend appointments on Fridays', false]);
    const restored = (await sql`select revision, review_reason from companion_proposals
      where id = ${draft.json.proposal.proposal_id}`)[0];
    assertEquals([restored.revision, restored.review_reason], [2, 'restored']);
    const old = await apply(a, [detailCreate('I need an interpreter')], { authorization: approved(draft.json.proposal), operation_id: uuid() });
    assertEquals(old.status, 403, 'an approval captured before the rollback applied');
    const next = await apply(a, [detailUpdate(id, 'I can attend appointments on Sundays', 2)]);
    assertEquals(next.status, 200, JSON.stringify(next.json));
    assertEquals((await detailRows(a.id)).length, 1);
  },
});

Deno.test({
  name: 'the full schema rollback (all four migrations) and re-application still work with #370 first',
  ...testOpts,
  fn: async () => {
    // Wrong if: the #370 rollback leaves an object the earlier rollbacks cannot drop, or
    // the full re-application cannot restore a detail.
    const a = await newAccount('details-full-rollback');
    await rememberedBy(a, 'I prefer phone calls to email');
    await migrate('down');
    await migrate('up');
    await openGate();
    assertEquals(await contextDetails(a), ['I prefer phone calls to email']);
  },
});
