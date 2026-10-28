// #365 task edits and #370 saved details together (composition of the two migrations that
// both replace the shared action functions). Every migration is applied in timestamp
// order (#361, #363, #364, #366, #365, #370). Through the public request boundary with real
// JWTs: one account edits an existing task, changes a waiting reason, saves and edits a
// detail, looks up and replays receipts and uses Undo, while its plan and steps stay as
// they were; another account can use none of it. Each test names the observation that
// would prove the composition wrong.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import {
  type Account, apply, approved, cancel, command, confirmedRemoval, conversationActions, conversationWith,
  detailRows, detailsOf, detailUpdate, existingCustomTask, interpret, messageIn, newAccount, planApply, plansOf,
  prepare, read, ready, rememberedBy, setState, status, stepCreate, stepsOf, taskOf, testOpts, undo, uuid,
} from './support.ts';
import { draftFor, vancouverArrival } from './planSupport.ts';

await ready();

const reasons = (r: Record<string, unknown>) => [r.before_waiting_reason, r.after_waiting_reason];

/** Interprets and applies one clear edit command of `who`; returns both replies. */
async function edit(who: Account, conversationRow: number, text: string) {
  const message_id = await messageIn(who, conversationRow, 'user', text);
  const i = await interpret(who, message_id);
  assertEquals([i.status, i.json.command?.kind], [200, 'edit'], `${text}: ${JSON.stringify(i.json)}`);
  const op = i.json.command.operation;
  const a = await apply(who, [op], { authorization: command(message_id) });
  return { message_id, op, a };
}

Deno.test({
  name: 'one account edits a task, changes a waiting reason and saves a detail through the same service; receipts, lookup, replay and Undo keep both domains',
  ...testOpts,
  fn: async () => {
    // Wrong if: an edit draft cannot be prepared, listed, approved or cancelled once #370
    // is applied; a state change does not name its waiting reasons in its receipt, lookup
    // or replay; a detail cannot be saved, read or edited; a detail receipt is listed as a
    // task command or an edit command as a detail command; or Undo of either kind fails.
    const a = await newAccount('compose');
    const { ref, id } = await existingCustomTask(a, 'Get a phone plan');
    const { conversation_id, conversationRow, message_id: answer } =
      await conversationWith(a, 'assistant', 'A prepaid plan needs no credit check.');

    // #365 suggested edit: a draft, listed with the conversation, approved once.
    const p = await prepare(a, { type: 'task.edit_details', task_ref: ref, priority: 'Do now' },
      { source: { conversation_id, message_id: answer } });
    assertEquals(p.status, 200, `prepare edit draft: ${JSON.stringify(p.json)}`);
    assertEquals([p.json.proposal.kind, p.json.proposal.status], ['task_edit', 'draft']);
    const listed = await conversationActions(a, conversation_id);
    assertEquals(listed.status, 200, JSON.stringify(listed.json));
    assertEquals(listed.json.proposals.map((x: { proposal_id: string }) => x.proposal_id), [p.json.proposal.proposal_id],
      'the edit draft is not listed with its conversation');
    const approvedEdit = await apply(a, p.json.proposal.operations, { authorization: approved(p.json.proposal) });
    assertEquals(approvedEdit.status, 200, `approve edit: ${JSON.stringify(approvedEdit.json)}`);
    assertEquals(approvedEdit.json.receipt.changes, [{ field: 'priority', before: 'Do soon', after: 'Do now' }]);
    const row = await a.client.from('custom_checklist_tasks').select('priority, revision').eq('id', id).single();
    assertEquals(row.data, { priority: 'Do now', revision: 2 });

    // A second draft is cancelled: nothing changes.
    const p2 = await prepare(a, { type: 'task.edit_details', task_ref: ref, title: 'Get a prepaid plan' },
      { source: { conversation_id, message_id: answer } });
    assertEquals(p2.status, 200, `prepare second edit draft: ${JSON.stringify(p2.json)}`);
    const c = await cancel(a, p2.json.proposal.proposal_id, p2.json.proposal.proposal_revision);
    assertEquals([c.status, c.json.proposal?.status], [200, 'cancelled'], `cancel edit draft: ${JSON.stringify(c.json)}`);
    assertEquals((await taskOf(a, ref)).title, 'Get a phone plan');

    // #365 clear commands: a waiting reason, then a changed reason, named in the receipt.
    const friday = await edit(a, conversationRow, 'Mark task "Get a phone plan" as waiting: The store calls on Friday');
    assertEquals(friday.a.status, 200, `waiting command: ${JSON.stringify(friday.a.json)}`);
    assertEquals(reasons(friday.a.json.receipt), [null, 'The store calls on Friday']);
    const monday = await edit(a, conversationRow, 'Mark task "Get a phone plan" as waiting: The store calls on Monday');
    assertEquals(monday.a.status, 200, `reason change command: ${JSON.stringify(monday.a.json)}`);
    assertEquals(reasons(monday.a.json.receipt), ['The store calls on Friday', 'The store calls on Monday']);
    const looked = await status(a, monday.a.json.operation_id);
    assertEquals([looked.json.status, ...reasons(looked.json.receipt ?? {})],
      ['applied', 'The store calls on Friday', 'The store calls on Monday'], 'lookup lost the waiting reasons');
    const replay = await apply(a, [monday.op], { operation_id: monday.a.json.operation_id, authorization: command(monday.message_id) });
    assertEquals([replay.status, replay.json.replayed, ...reasons(replay.json.receipt ?? {})],
      [200, true, 'The store calls on Friday', 'The store calls on Monday'], 'replay lost the waiting reasons');

    // #370 remember command in the same conversation: saved, read, edited.
    const remember = await messageIn(a, conversationRow, 'user', 'Remember that I can attend appointments on Fridays');
    const ri = await interpret(a, remember);
    assertEquals(ri.json.command?.kind, 'remember', JSON.stringify(ri.json));
    const saved = await apply(a, [ri.json.command.operation], { authorization: command(remember) });
    assertEquals(saved.status, 200, `remember: ${JSON.stringify(saved.json)}`);
    const [detail] = await detailsOf(a);
    assertEquals([detail?.text, detail?.revision], ['I can attend appointments on Fridays', 1]);
    const changed = await apply(a, [detailUpdate(detail.detail_id as string, 'I can attend appointments on Saturdays', 1)]);
    assertEquals([changed.status, changed.json.receipt?.detail?.before_text],
      [200, 'I can attend appointments on Fridays'], JSON.stringify(changed.json));

    // The conversation keeps each kind in its own list (older clients read `commands`).
    const after = await conversationActions(a, conversation_id);
    const commandIds = after.json.commands.map((x: { message_id: number }) => x.message_id);
    assertEquals(commandIds, [friday.message_id, monday.message_id], 'commands should list exactly the two edit commands');
    assertEquals(after.json.detail_commands.map((x: { message_id: number }) => x.message_id), [remember]);
    const listedMonday = after.json.commands[1].receipt;
    assertEquals([listedMonday.current, ...reasons(listedMonday)], [true, 'The store calls on Friday', 'The store calls on Monday']);

    // Undo of each kind: the reason, the priority edit and the saved detail.
    const u1 = await undo(a, monday.a.json.operation_id);
    assertEquals(u1.status, 200, `undo reason change: ${JSON.stringify(u1.json)}`);
    assertEquals((await taskOf(a, ref)).waiting_reason, 'The store calls on Friday');
    const u2 = await undo(a, approvedEdit.json.operation_id);
    assertEquals(u2.status, 409, 'an edit receipt that the later state changes made historical must not be undone directly');
    const undoSave = await undo(a, saved.json.operation_id);
    assertEquals(undoSave.status, 409, 'a detail save edited later must not be undone directly');
    const undoEdit = await undo(a, changed.json.operation_id);
    assertEquals(undoEdit.status, 200, `undo detail edit: ${JSON.stringify(undoEdit.json)}`);
    assertEquals((await detailsOf(a)).map(d => [d.text, d.revision]), [['I can attend appointments on Fridays', 3]]);
  },
});

Deno.test({
  name: 'an eligible Undo of a #365 edit and of a #370 save applies; plans and steps of the account are unchanged by both',
  ...testOpts,
  fn: async () => {
    // Wrong if: Undo of the latest edit or detail save is refused or changes something
    // else; a removing Undo applies without confirmation; or the account's plan or steps
    // read differently after the edit and detail changes.
    const { a, sin, bank } = await vancouverArrival('compose-plan');
    const plan = await planApply(a, await draftFor(a, sin, bank));
    assertEquals(plan.status, 200, `plan: ${JSON.stringify(plan.json)}`);
    const phone = plan.json.receipt.results[2].task_ref as string;
    const steps = await apply(a, [stepCreate(phone, ['Compare prepaid plans'])]);
    assertEquals(steps.status, 200, `steps: ${JSON.stringify(steps.json)}`);
    const plansBefore = (await plansOf(a)).json.plans;
    const stepsBefore = await stepsOf(a, phone);

    const phoneId = Number(phone.slice('custom:'.length));
    const before = await a.client.from('custom_checklist_tasks').select('description').eq('id', phoneId).single();
    const p = await prepare(a, { type: 'task.edit_details', task_ref: phone, description: 'Prepaid, no credit check' });
    assertEquals(p.status, 200, `prepare edit draft: ${JSON.stringify(p.json)}`);
    const e = await apply(a, p.json.proposal.operations, { authorization: approved(p.json.proposal) });
    assertEquals(e.status, 200, `approve edit: ${JSON.stringify(e.json)}`);
    const r = await rememberedBy(a, 'I need an interpreter for appointments');

    const ue = await undo(a, e.json.operation_id);
    assertEquals(ue.status, 200, `undo edit: ${JSON.stringify(ue.json)}`);
    assertEquals(ue.json.receipt.changes, [{ field: 'description', before: 'Prepaid, no credit check', after: before.data?.description }]);
    const unconfirmed = await undo(a, r.operation_id);
    assertEquals(unconfirmed.status, 403, 'a removing Undo applied without confirmation');
    const ur = await undo(a, r.operation_id, { authorization: confirmedRemoval });
    assertEquals(ur.status, 200, `undo save: ${JSON.stringify(ur.json)}`);
    assertEquals(await detailsOf(a), []);
    assertEquals((await detailRows(a.id)).map(d => [d.body, d.removed]), [['I need an interpreter for appointments', true]]);

    assertEquals((await plansOf(a)).json.plans, plansBefore, 'the plan changed');
    assertEquals(await stepsOf(a, phone), stepsBefore, 'the steps changed');
  },
});

Deno.test({
  name: "another account cannot interpret, apply, look up or undo the owner's edit commands, edit drafts, details or receipts",
  ...testOpts,
  fn: async () => {
    // Wrong if: any of the stranger's requests succeeds, reveals the owner's data or
    // changes the owner's task or detail.
    const a = await newAccount('owner');
    const s = await newAccount('stranger');
    const { ref } = await existingCustomTask(a, 'Get a phone plan');
    const { conversation_id, conversationRow } = await conversationWith(a, 'user', 'hello');
    const w = await edit(a, conversationRow, 'Mark task "Get a phone plan" as waiting: Letter from the bank');
    assertEquals(w.a.status, 200, JSON.stringify(w.a.json));
    const r = await rememberedBy(a, 'I can attend appointments on Fridays');
    const [detail] = await detailsOf(a);
    const p = await prepare(a, { type: 'task.edit_details', task_ref: ref, priority: 'Do now' });
    assertEquals(p.status, 200, JSON.stringify(p.json));

    assertEquals((await interpret(s, w.message_id)).status, 404);
    assertEquals((await apply(s, [w.op], { authorization: command(w.message_id) })).status, 403);
    assert([403, 404].includes((await apply(s, p.json.proposal.operations, { authorization: approved(p.json.proposal) })).status));
    assert([403, 404, 409].includes((await apply(s, [detailUpdate(detail.detail_id as string, 'stolen', 1)])).status));
    const looked = await status(s, w.a.json.operation_id);
    assert(looked.json.receipt === undefined || looked.json.status !== 'applied', 'lookup revealed the owner receipt');
    assertEquals((await undo(s, w.a.json.operation_id)).status, 404);
    assertEquals((await undo(s, r.operation_id, { authorization: confirmedRemoval })).status, 404);
    assertEquals((await conversationActions(s, conversation_id)).status, 404);
    assertEquals(await detailsOf(s), []);
    assertEquals((await read(s)).json.tasks.some((x: { task_ref: string }) => x.task_ref === ref), false);

    assertEquals((await taskOf(a, ref)).waiting_reason, 'Letter from the bank');
    assertEquals((await detailsOf(a)).map(d => [d.text, d.revision]), [['I can attend appointments on Fridays', 1]]);
  },
});

Deno.test({
  name: 'concurrent edit commands, remember commands, detail edits and retries each apply once',
  ...testOpts,
  fn: async () => {
    // Wrong if: a concurrent retry writes twice, two edits at one revision both apply, a
    // remember command and an approval of the same text save two details, or one domain's
    // lock blocks or loses the other's write.
    const a = await newAccount('concurrent');
    const { ref, id } = await existingCustomTask(a, 'Get a phone plan');
    const { conversationRow } = await conversationWith(a, 'user', 'hello');
    const waitMsg = await messageIn(a, conversationRow, 'user', 'Mark task "Get a phone plan" as waiting: SIM card in the mail');
    const rememberMsg = await messageIn(a, conversationRow, 'user', 'Remember that I prefer appointments after 5 pm');
    const [wi, ri] = await Promise.all([interpret(a, waitMsg), interpret(a, rememberMsg)]);
    assertEquals([wi.json.command?.kind, ri.json.command?.kind], ['edit', 'remember']);
    const editOp = uuid();
    const rememberOp = uuid();
    const replies = await Promise.all([
      apply(a, [wi.json.command.operation], { operation_id: editOp, authorization: command(waitMsg) }),
      apply(a, [wi.json.command.operation], { operation_id: editOp, authorization: command(waitMsg) }),
      apply(a, [ri.json.command.operation], { operation_id: rememberOp, authorization: command(rememberMsg) }),
      apply(a, [ri.json.command.operation], { operation_id: rememberOp, authorization: command(rememberMsg) }),
    ]);
    for (const x of replies) assert([200, 202, 409].includes(x.status), JSON.stringify(x.json));
    assertEquals(replies.filter(x => x.status === 200 && x.json.replayed === false).length, 2,
      `exactly one first write per operation: ${JSON.stringify(replies.map(x => [x.status, x.json.replayed, x.json.error]))}`);
    assertEquals((await status(a, editOp)).json.status, 'applied');
    assertEquals((await status(a, rememberOp)).json.status, 'applied');
    const row = await a.client.from('custom_checklist_tasks').select('waiting_reason, revision').eq('id', id).single();
    assertEquals(row.data, { waiting_reason: 'SIM card in the mail', revision: 2 });
    assertEquals((await detailRows(a.id)).map(d => d.body), ['I prefer appointments after 5 pm']);

    // Two different edits at the same revision, at the same time as two detail edits.
    const [detail] = await detailsOf(a);
    const t = await taskOf(a, ref);
    const both = await Promise.all([
      apply(a, [setState(ref, 'in_progress', t.revision)]),
      apply(a, [setState(ref, 'not_started', t.revision)]),
      apply(a, [detailUpdate(detail.detail_id as string, 'I prefer appointments after 6 pm', 1)]),
      apply(a, [detailUpdate(detail.detail_id as string, 'I prefer appointments after 4 pm', 1)]),
    ]);
    assertEquals(both.slice(0, 2).map(x => x.status).sort(), [200, 409], JSON.stringify(both.map(x => x.json)));
    assertEquals(both.slice(2).map(x => x.status).sort(), [200, 409], JSON.stringify(both.map(x => x.json)));
    assertEquals((await taskOf(a, ref)).revision, t.revision + 1);
    assertEquals((await detailsOf(a)).map(d => d.revision), [2]);
  },
});
