// Historical receipt text (mobile-app#363 review F3) through the public request
// boundary, against a real local Postgres + GoTrue + PostgREST + edge runtime. A
// receipt names the change it recorded. When the owner later renames the task, the
// receipt keeps the title it saved (and says it is no longer current), while the
// Checklist shows the new title. Each test names the observation that would prove
// the behavior wrong.
import { assertEquals } from 'jsr:@std/assert@1';
import {
  apply, approved, checklistTitles, conversationActions, conversationWith, createTask, interpret,
  newAccount, prepare, proposalOf, ready, sql, status, testOpts, undo,
} from './support.ts';

await ready();

const PHONE = 'Set up phone service';
const DOCTOR = 'Find a family doctor';
const confirmedRemoval = { kind: 'ui_control', removal_confirmed: true };

async function rename(a: Awaited<ReturnType<typeof newAccount>>, taskRef: string, title: string) {
  // The owner's own Checklist edit, as released clients make it (user JWT, RLS).
  const r = await a.client.from('custom_checklist_tasks').update({ title }).eq('id', taskRef.slice(7));
  assertEquals(r.error, null);
}

Deno.test({
  name: 'an approved creation receipt keeps the reviewed title after the owner renames the task',
  ...testOpts,
  fn: async () => {
    // Wrong if: the historical receipt, its replay or the draft's receipt names the
    // later title, the receipt still claims to be current, or the Checklist does not
    // show the rename.
    const a = await newAccount('history-approved');
    const p = (await prepare(a, createTask(PHONE))).json.proposal;
    const w = await apply(a, p.operations, { authorization: approved(p) });
    assertEquals(w.status, 200, JSON.stringify(w.json));
    assertEquals([w.json.receipt.title, w.json.receipt.current], [PHONE, true]);
    const ref = w.json.receipt.task_ref as string;

    await rename(a, ref, DOCTOR);
    assertEquals(await checklistTitles(a), [DOCTOR]);

    const s = await status(a, w.json.operation_id);
    assertEquals(s.status, 200, JSON.stringify(s.json));
    assertEquals([s.json.receipt.task_ref, s.json.receipt.current], [ref, false]);
    assertEquals(
      [s.json.receipt.before_revision, s.json.receipt.after_revision],
      [w.json.receipt.before_revision, w.json.receipt.after_revision],
    );
    assertEquals(s.json.receipt.title, PHONE, 'receipt text must preserve the saved change');

    // The same operation again replays the recorded receipt: no second task, same text.
    const replay = await apply(a, p.operations, { operation_id: w.json.operation_id, authorization: approved(p) });
    assertEquals([replay.status, replay.json.replayed, replay.json.receipt.title], [200, true, PHONE]);
    assertEquals(await checklistTitles(a), [DOCTOR]);

    // The draft shows the receipt it produced, with the same text.
    const view = await proposalOf(a, p.proposal_id);
    assertEquals([view.json.proposal.status, view.json.proposal.receipt.title], ['applied', PHONE]);
  },
});

Deno.test({
  name: 'a command creation receipt keeps the commanded title after a rename, in status and in its conversation',
  ...testOpts,
  fn: async () => {
    // Wrong if: the command result shown in the conversation follows the rename.
    const a = await newAccount('history-command');
    const { conversation_id, message_id } = await conversationWith(a, 'user', `Add task: ${PHONE}`);
    const i = await interpret(a, message_id);
    assertEquals(i.json.command.kind, 'create', JSON.stringify(i.json));
    const w = await apply(a, [i.json.command.operation], {
      authorization: { kind: 'direct_command', message_id },
    });
    assertEquals([w.status, w.json.receipt.title], [200, PHONE], JSON.stringify(w.json));

    await rename(a, w.json.receipt.task_ref, DOCTOR);
    assertEquals(await checklistTitles(a), [DOCTOR]);

    const s = await status(a, w.json.operation_id);
    assertEquals([s.json.receipt.current, s.json.receipt.title], [false, PHONE]);
    const c = await conversationActions(a, conversation_id);
    assertEquals(c.status, 200, JSON.stringify(c.json));
    assertEquals(
      c.json.commands.map((x: { message_id: number; receipt: { title: string } }) => [x.message_id, x.receipt.title]),
      [[message_id, PHONE]],
    );
  },
});

Deno.test({
  name: 'after a rename, Undo still needs review; the removal receipt names the task it removed and keeps that name',
  ...testOpts,
  fn: async () => {
    // Wrong if: the rename is overwritten by Undo, the removal applies without its
    // reviewed confirmation, either receipt's text follows a later rename, or the
    // creation receipt changes its identity or revisions.
    const a = await newAccount('history-undo');
    const p = (await prepare(a, createTask(PHONE))).json.proposal;
    const w = await apply(a, p.operations, { authorization: approved(p) });
    const ref = w.json.receipt.task_ref as string;
    await rename(a, ref, DOCTOR);

    const u = await undo(a, w.json.operation_id, { authorization: confirmedRemoval });
    assertEquals([u.status, u.json.error], [409, 'undo_conflict'], JSON.stringify(u.json));
    assertEquals(await checklistTitles(a), [DOCTOR]);
    const removal = u.json.proposal;
    const r = await apply(a, removal.operations, {
      authorization: { ...approved(removal), removal_confirmed: true },
    });
    assertEquals(r.status, 200, JSON.stringify(r.json));
    assertEquals([r.json.receipt.operation_type, r.json.receipt.undo_of], ['task.remove_created', w.json.operation_id]);
    assertEquals(r.json.receipt.title, DOCTOR, 'a removal receipt names the task as it was removed');
    assertEquals(await checklistTitles(a), []);

    // A later change to the removed row moves neither receipt's text.
    await sql`update public.custom_checklist_tasks set title = 'Third title' where id = ${Number(ref.slice(7))}`;
    const removed = await status(a, r.json.operation_id);
    assertEquals(removed.json.receipt.title, DOCTOR);
    const created = await status(a, w.json.operation_id);
    assertEquals(
      [created.json.receipt.title, created.json.receipt.task_ref, created.json.receipt.undone_by, created.json.receipt.undoable],
      [PHONE, ref, r.json.operation_id, false],
    );
  },
});

Deno.test({ name: 'cleanup', ...testOpts, fn: async () => { await sql.end(); } });
