// Rollback and re-application of the composed #365 and #370 migrations, in actual
// timestamp order (#361, #363, #364, #366, #365, #370 up; the reverse down). The #370
// rollback must restore the accepted #365 bodies of the shared action functions and the
// #365 proposal kinds, not the #366 ones, and re-application must restore #370 exactly.
// Data written at #370 keeps its identity: receipts replay, details and drafts return.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import {
  type Account, MIGRATION, apply, command, conversationActions, conversationWith, detailRows, detailsOf, interpret,
  messageIn, migrate, migrate363, migrate364, migrate365, migrate366, migrate370, migration370Applied, newAccount,
  openGate, prepare, ready, rememberedBy, sql, status, testOpts, waitForSchemaCache,
} from './support.ts';

await ready();

/** Every companion function (signature -> definition and grants) and the proposal kinds. */
async function schemaPrint(): Promise<Record<string, string>> {
  const fns = await sql`select p.oid::regprocedure::text as sig, md5(pg_get_functiondef(p.oid)) as def,
      coalesce(p.proacl::text, '') as acl
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'companion%' order by 1`;
  const out: Record<string, string> = Object.fromEntries(fns.map(f => [f.sig as string, `${f.def} ${f.acl}`]));
  const [k] = await sql`select pg_get_constraintdef(c.oid) as def from pg_constraint c
    where c.conname = 'companion_proposals_kind_check'`;
  out['constraint companion_proposals_kind_check'] = k?.def ?? '<absent>';
  return out;
}

/** The fields of two prints that differ (empty when equal). */
function differences(a: Record<string, string>, b: Record<string, string>): string[] {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(k => a[k] !== b[k]).sort();
}

const reasons = (r: Record<string, unknown> | undefined) => [r?.before_waiting_reason, r?.after_waiting_reason];

/** Runs a migration step and returns its error text, or null (an assertion, not a crash). */
const attempt = (step: () => Promise<void>) => step().then(() => null, (e: unknown) => String(e).slice(0, 400));

Deno.test({
  name: 'the #370 rollback restores the accepted #365 shared functions and kinds; re-application restores #370 exactly',
  ...testOpts,
  fn: async () => {
    // Wrong if: after the #370 rollback any companion function, grant or the proposal kind
    // check differs from a stack migrated only up to #365 (for example a #366 body that
    // drops task edits or waiting reasons), or #370 re-applied differs from its first run.
    assertEquals(await attempt(() => migrate('down')), null, 'full rollback failed');
    await sql.begin(async tx => await tx.unsafe(await Deno.readTextFile(MIGRATION)));
    await waitForSchemaCache('up361');
    await migrate363('up');
    await migrate364('up');
    await migrate366('up');
    await migrate365('up');
    const at365 = await schemaPrint();
    assert(Object.keys(at365).some(k => k.startsWith('companion_prepare_edit(')), 'the #365 migration did not apply');
    assertEquals(await attempt(() => migrate370('up')), null, 'the #370 migration failed after #365');
    const at370 = await schemaPrint();
    assertEquals(await attempt(() => migrate370('down')), null, 'the #370 rollback failed');
    assertEquals(differences(at365, await schemaPrint()), [], 'the #370 rollback did not restore the #365 schema');
    assertEquals(await attempt(() => migrate370('up')), null, 'the #370 migration failed on re-application');
    assertEquals(differences(at370, await schemaPrint()), [], 'the re-applied #370 schema differs');
    await openGate();
  },
});

Deno.test({
  name: 'data saved with both migrations keeps its identity through the #370 rollback, the full reverse rollback and re-application',
  ...testOpts,
  fn: async () => {
    // Wrong if: a rollback step fails with #365 and #370 data present; while #370 is
    // rolled back an edit draft or a waiting-reason receipt is lost or a new edit command
    // fails; after re-application a detail, a detail draft, a receipt lookup or a replay
    // differs from before, or a retried operation writes again.
    await ready();
    const a: Account = await newAccount('compose-rollback');
    const t = await a.client.from('custom_checklist_tasks')
      .insert({ user_id: a.id, title: 'Get a phone plan', description: '', priority: 'Do soon' }).select('id').single();
    const ref = `custom:${t.data!.id}`;
    const { conversation_id, conversationRow, message_id: answer } = await conversationWith(a, 'assistant', 'Answer.');
    const waitMsg = await messageIn(a, conversationRow, 'user', 'Mark task "Get a phone plan" as waiting: Letter from the bank');
    const wi = await interpret(a, waitMsg);
    assertEquals(wi.json.command?.kind, 'edit', JSON.stringify(wi.json));
    const waited = await apply(a, [wi.json.command.operation], { authorization: command(waitMsg) });
    assertEquals(waited.status, 200, JSON.stringify(waited.json));
    const editDraft = await prepare(a, { type: 'task.edit_details', task_ref: ref, priority: 'Do now' },
      { source: { conversation_id, message_id: answer } });
    assertEquals(editDraft.status, 200, `prepare edit draft: ${JSON.stringify(editDraft.json)}`);
    const remembered = await rememberedBy(a, 'I can attend appointments on Fridays');
    const detailDraft = await prepare(a, { type: 'detail.create', text: 'I need an interpreter' },
      { source: { conversation_id, message_id: answer } });
    assertEquals(detailDraft.status, 200, `prepare detail draft: ${JSON.stringify(detailDraft.json)}`);
    const before = {
      waited: (await status(a, waited.json.operation_id)).json.receipt,
      remembered: (await status(a, remembered.operation_id)).json.receipt,
      details: await detailsOf(a),
    };
    assertEquals(reasons(before.waited), [null, 'Letter from the bank']);

    // #370 rolled back alone: #365 keeps working with its data.
    assertEquals(await attempt(() => migrate370('down')), null, 'the #370 rollback failed with #365 data present');
    await openGate();
    assert(!(await migration370Applied()));
    const listed = await conversationActions(a, conversation_id);
    assertEquals(listed.status, 200, JSON.stringify(listed.json));
    assertEquals(listed.json.proposals.map((p: { proposal_id: string; status: string }) => [p.proposal_id, p.status]),
      [[editDraft.json.proposal.proposal_id, 'draft']], 'the #365 edit draft was lost by the #370 rollback');
    assertEquals(reasons((await status(a, waited.json.operation_id)).json.receipt), [null, 'Letter from the bank'],
      'the #370 rollback dropped the waiting reasons from #365 receipts');
    const later = await messageIn(a, conversationRow, 'user', 'Mark task "Get a phone plan" as waiting: Letter from the clinic');
    const li = await interpret(a, later);
    assertEquals(li.json.command?.kind, 'edit', JSON.stringify(li.json));
    const lw = await apply(a, [li.json.command.operation], { authorization: command(later) });
    assertEquals([lw.status, ...reasons(lw.json.receipt)], [200, 'Letter from the bank', 'Letter from the clinic'],
      `an edit command while #370 is rolled back: ${JSON.stringify(lw.json)}`);
    assertEquals(await attempt(() => migrate370('up')), null, 'the #370 migration failed on re-application');
    await openGate();
    assertEquals(await detailsOf(a), before.details, 'details changed through the #370 rollback');

    // Full reverse rollback and re-application in timestamp order.
    assertEquals(await attempt(() => migrate('down')), null, 'the full reverse rollback failed');
    assertEquals(await attempt(() => migrate('up')), null, 'the re-application failed');
    await openGate();
    assertEquals(await detailsOf(a), before.details, 'details changed through the full rollback');
    assertEquals((await status(a, remembered.operation_id)).json.receipt, before.remembered);
    const w2 = (await status(a, waited.json.operation_id)).json.receipt;
    assertEquals([w2?.operation_id, ...reasons(w2)], [waited.json.operation_id, null, 'Letter from the bank']);
    const replayW = await apply(a, [wi.json.command.operation],
      { operation_id: waited.json.operation_id, authorization: command(waitMsg) });
    assertEquals([replayW.status, replayW.json.replayed], [200, true], JSON.stringify(replayW.json));
    const m = await sql`select content from messages where id = ${remembered.message_id}`;
    assertEquals(m[0].content, 'Remember that I can attend appointments on Fridays');
    const replayR = await apply(a, [{ type: 'detail.create', text: 'I can attend appointments on Fridays' }],
      { operation_id: remembered.operation_id, authorization: command(remembered.message_id) });
    assertEquals([replayR.status, replayR.json.replayed], [200, true], JSON.stringify(replayR.json));
    assertEquals((await detailRows(a.id)).length, 1, 'a retried remember wrote a second detail');
    const c = await conversationActions(a, conversation_id);
    const edit = c.json.proposals.find((p: { proposal_id: string }) => p.proposal_id === editDraft.json.proposal.proposal_id);
    const detail = c.json.detail_proposals.find((p: { proposal_id: string }) => p.proposal_id === detailDraft.json.proposal.proposal_id);
    assertEquals([edit?.status, detail?.status], ['draft', 'draft'], JSON.stringify(c.json));
    assert(detail.proposal_revision > detailDraft.json.proposal.proposal_revision, 'a restored detail draft needs a new review');
  },
});
