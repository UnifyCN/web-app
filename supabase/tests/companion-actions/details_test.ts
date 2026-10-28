// Saved personal details (mobile-app#370) through the public request boundary, against a
// real local Postgres + GoTrue + PostgREST + edge runtime. A detail is saved only by the
// user's own clear "remember" message or an approved draft, is read by later answers
// (user JWT + RLS) while it is live, and is edited and removed through the common
// revision, receipt, lookup and Undo rules. Each test names the observation that would
// prove the behavior wrong.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import {
  apply, approved, call, cancel, command, contextDetails, conversationActions, conversationWith, detailCreate,
  detailRemove, detailRows, detailsOf, detailUpdate, holdOperationLock, interpret, newAccount, openGate, prepare,
  read, ready, rememberedBy, revise, said, sql, status, testOpts, undo, uuid, waitForBlocked,
} from './support.ts';

await ready();

const confirmed = { kind: 'ui_control', removal_confirmed: true };

Deno.test({
  name: 'a clear remember message saves exactly that detail once, with owner, scope, provenance and revision',
  ...testOpts,
  fn: async () => {
    // Wrong if: the saved text differs from the message, a second write uses the same
    // message, an assistant message or another account's message authorizes a save, or
    // the detail is missing from the next read and from a later answer's context read.
    const a = await newAccount('details-command');
    const m = await said(a, 'Remember that I can attend appointments on Fridays.');
    const i = await interpret(a, m.message_id);
    assertEquals(i.status, 200, JSON.stringify(i.json));
    assertEquals(i.json.command.kind, 'remember');
    assertEquals(i.json.command.operation, detailCreate('I can attend appointments on Fridays'));
    assertEquals(await detailRows(a.id), [], 'interpreting wrote a detail');

    const w = await apply(a, [i.json.command.operation], { authorization: command(m.message_id) });
    assertEquals(w.status, 200, JSON.stringify(w.json));
    const r = w.json.receipt;
    assertEquals([r.operation_type, r.kind, r.task_ref, r.current, r.undoable], ['detail.create', 'change', null, true, true]);
    assertEquals([r.detail.text, r.detail.before_text, r.before_revision, r.after_revision],
      ['I can attend appointments on Fridays', null, 0, 1]);

    const details = await detailsOf(a, 'web');
    assertEquals(details.length, 1);
    assertEquals([details[0].detail_id, details[0].text, details[0].revision, details[0].scope],
      [r.detail.detail_id, 'I can attend appointments on Fridays', 1, 'companion']);
    assertEquals(details[0].source, { kind: 'direct_command', conversation_id: m.conversation_id });
    assertEquals(await contextDetails(a), ['I can attend appointments on Fridays']);

    // One message authorizes one write.
    const again = await apply(a, [detailCreate('I can attend appointments on Fridays')], { authorization: command(m.message_id) });
    assertEquals([again.status, again.json.error], [409, 'command_already_used'], JSON.stringify(again.json));
    const other = await said(a, 'Remember that I prefer mornings');
    const widened = await apply(a, [detailCreate('I prefer evenings')], { authorization: command(other.message_id) });
    assertEquals(widened.status, 403, 'a command saved text it did not say');
    const assistant = await conversationWith(a, 'assistant', 'Remember that I prefer evenings');
    const byAssistant = await apply(a, [detailCreate('I prefer evenings')], { authorization: command(assistant.message_id) });
    assertEquals(byAssistant.status, 403, 'an assistant message authorized a save');
    const b = await newAccount('details-command-b');
    const foreign = await apply(b, [detailCreate('I prefer mornings')], { authorization: command(other.message_id) });
    assertEquals(foreign.status, 403, "another account's message authorized a save");
    // A forged approval flag or a direct control never saves a new detail.
    assertEquals((await apply(a, [detailCreate('I prefer evenings')])).status, 403);
    assertEquals((await apply(a, [detailCreate('I prefer evenings')], { authorization: { kind: 'ui_control', approved: true } })).status, 403);
    assertEquals((await detailRows(a.id)).length, 1);
    assertEquals(await detailRows(b.id), []);
  },
});

// Clear commands, unclear ones and profile facts, in every supported language. The list
// is the documented grammar (commands.ts): it is not a general language parser.
const EXAMPLES: [string, unknown][] = [
  ['Remember that I need appointments after 5 pm', { kind: 'remember', text: 'I need appointments after 5 pm' }],
  ['Remember: my son starts school in January', { kind: 'remember', text: 'my son starts school in January' }],
  ['Souviens-toi que je préfère les rendez-vous le vendredi.', { kind: 'remember', text: 'je préfère les rendez-vous le vendredi' }],
  ['Recuerda que necesito citas por la tarde', { kind: 'remember', text: 'necesito citas por la tarde' }],
  ['Hãy nhớ rằng tôi chỉ rảnh vào thứ Sáu', { kind: 'remember', text: 'tôi chỉ rảnh vào thứ Sáu' }],
  ['याद रखें कि मुझे शुक्रवार को समय मिलता है', { kind: 'remember', text: 'मुझे शुक्रवार को समय मिलता है' }],
  ['ਯਾਦ ਰੱਖੋ ਕਿ ਮੈਂ ਸ਼ੁੱਕਰਵਾਰ ਨੂੰ ਖਾਲੀ ਹਾਂ', { kind: 'remember', text: 'ਮੈਂ ਸ਼ੁੱਕਰਵਾਰ ਨੂੰ ਖਾਲੀ ਹਾਂ' }],
  ['تذكر أن مواعيدي المفضلة يوم الجمعة', { kind: 'remember', text: 'مواعيدي المفضلة يوم الجمعة' }],
  ['Remember this', { kind: 'remember_clarify', reason: 'unclear_reference' }],
  ['Recuerda eso.', { kind: 'remember_clarify', reason: 'unclear_reference' }],
  ['Remember that', { kind: 'remember_clarify', reason: 'missing_detail' }],
  ['Remember that I like Fridays\nand also mornings', { kind: 'remember_clarify', reason: 'multiple' }],
  [`Remember that ${'x'.repeat(301)}`, { kind: 'remember_clarify', reason: 'too_long' }],
  ['Remember that I live in Alberta now', { kind: 'profile_fact', field: 'province' }],
  ['Remember that I am moving to Calgary', { kind: 'profile_fact', field: 'province' }],
  ['Remember that I arrive on March 3', { kind: 'profile_fact', field: 'arrival_date' }],
  ['Recuerda que soy residente permanente', { kind: 'profile_fact', field: 'persona' }],
  ['تذكر أن وصولي الأسبوع القادم', { kind: 'profile_fact', field: 'arrival_date' }],
  ['Do you remember what I said?', { kind: 'none' }],
  ['I can only do Fridays', { kind: 'none' }],
];

Deno.test({
  name: 'interpret resolves the documented remember grammar in every supported language and writes nothing',
  ...testOpts,
  fn: async () => {
    // Wrong if: a clear command loses or changes its detail, an unclear one resolves to a
    // save, a province/arrival/status statement resolves to a save, or anything is written.
    const a = await newAccount('details-grammar');
    for (const [text, want] of EXAMPLES) {
      const m = await said(a, text);
      const i = await interpret(a, m.message_id);
      assertEquals(i.status, 200, JSON.stringify(i.json));
      const c = i.json.command;
      const got = c.kind === 'remember' ? { kind: 'remember', text: c.operation.text }
        : c.kind === 'remember_clarify' ? { kind: c.kind, reason: c.reason }
        : c.kind === 'profile_fact' ? { kind: c.kind, field: c.field } : { kind: c.kind };
      assertEquals(got, want, text);
    }
    assertEquals(await detailRows(a.id), []);
  },
});

Deno.test({
  name: 'a profile fact is never saved as a detail: by command, approved draft or edit',
  ...testOpts,
  fn: async () => {
    // Wrong if: any path stores a province, arrival date or immigration status as a
    // saved detail (the profile owns them), or the refusal is not explained by field.
    const a = await newAccount('details-profile');
    const m = await said(a, 'Remember that I live in Alberta now');
    const byCommand = await apply(a, [detailCreate('I live in Alberta now')], { authorization: command(m.message_id) });
    assertEquals([byCommand.status, byCommand.json.reason, byCommand.json.detail], [422, 'profile_fact', { field: 'province' }],
      JSON.stringify(byCommand.json));
    const draft = await prepare(a, detailCreate('My arrival date is March 3'), { source: { conversation_id: m.conversation_id } });
    assertEquals([draft.status, draft.json.reason, draft.json.detail], [422, 'profile_fact', { field: 'arrival_date' }],
      JSON.stringify(draft.json));
    const saved = await rememberedBy(a, 'I prefer phone calls to email');
    const edit = await apply(a, [detailUpdate(saved.receipt.detail.detail_id, 'I am a permanent resident', 1)]);
    assertEquals([edit.status, edit.json.reason, edit.json.detail], [422, 'profile_fact', { field: 'persona' }], JSON.stringify(edit.json));
    assertEquals((await detailRows(a.id)).map(r => r.body), ['I prefer phone calls to email']);
  },
});

Deno.test({
  name: 'an inferred detail is a draft until the shown revision is approved; Not now saves nothing',
  ...testOpts,
  fn: async () => {
    // Wrong if: preparing or cancelling writes a detail, an older revision's approval
    // applies after an edit, or the saved detail is not the approved text and source.
    const a = await newAccount('details-draft');
    const answer = await conversationWith(a, 'assistant', 'Fridays noted.');
    const p = await prepare(a, detailCreate('I can attend appointments on Fridays'),
      { source: { conversation_id: answer.conversation_id, message_id: answer.message_id } });
    assertEquals(p.status, 200, JSON.stringify(p.json));
    assertEquals([p.json.proposal.kind, p.json.proposal.status, p.json.proposal.context], ['detail_create', 'draft', { same_text_details: [] }]);
    assertEquals(await detailRows(a.id), [], 'preparing saved the detail');

    const listed = await conversationActions(a, answer.conversation_id);
    assertEquals(listed.status, 200);
    assertEquals(listed.json.detail_proposals.map((d: { proposal_id: string }) => d.proposal_id), [p.json.proposal.proposal_id]);
    assertEquals(listed.json.proposals, [], 'a detail draft was listed where older clients read task drafts');

    const r1 = await revise(a, p.json.proposal.proposal_id, 1, detailCreate('I can attend appointments on Saturdays'));
    assertEquals([r1.status, r1.json.proposal.proposal_revision], [200, 2]);
    const stale = await apply(a, [detailCreate('I can attend appointments on Fridays')], { authorization: approved(p.json.proposal) });
    assertEquals(stale.status, 403, 'an older revision was approved');
    const ok = await apply(a, [detailCreate('I can attend appointments on Saturdays')], { authorization: approved(r1.json.proposal) });
    assertEquals(ok.status, 200, JSON.stringify(ok.json));
    const [d] = await detailsOf(a);
    assertEquals([d.text, d.source], ['I can attend appointments on Saturdays',
      { kind: 'approved_proposal', conversation_id: answer.conversation_id }]);

    const p2 = await prepare(a, detailCreate('I need an interpreter'), { source: { conversation_id: answer.conversation_id } });
    const notNow = await cancel(a, p2.json.proposal.proposal_id, 1);
    assertEquals([notNow.status, notNow.json.proposal.status], [200, 'cancelled']);
    const late = await apply(a, [detailCreate('I need an interpreter')], { authorization: approved(p2.json.proposal) });
    assertEquals(late.status, 403, 'a cancelled draft was approved');
    assertEquals((await detailRows(a.id)).length, 1);
    // A draft needs the caller's own conversation as its source.
    const b = await newAccount('details-draft-b');
    const foreign = await prepare(b, detailCreate('I need an interpreter'), { source: { conversation_id: answer.conversation_id } });
    assertEquals(foreign.status, 404);
    const sourceless = await prepare(a, detailCreate('I need an interpreter'));
    assertEquals(sourceless.status, 422);
  },
});

Deno.test({
  name: 'an edit saves at the revision shown, names before and after, and a stale or concurrent edit cannot overwrite',
  ...testOpts,
  fn: async () => {
    // Wrong if: two concurrent edits at one revision both apply, a stale edit overwrites
    // the newer text, or the receipt does not name the exact change.
    const a = await newAccount('details-edit');
    const s = await rememberedBy(a, 'I can attend appointments on Fridays');
    const id = s.receipt.detail.detail_id;
    const texts = Array.from({ length: 8 }, (_, n) => `I can attend appointments on day ${n}`);
    const replies = await Promise.all(texts.map(t => apply(a, [detailUpdate(id, t, 1)])));
    const won = replies.filter(r => r.status === 200);
    assertEquals(won.length, 1, JSON.stringify(replies.map(r => r.status)));
    assert(replies.every(r => r.status === 200 || (r.status === 409 && r.json.error === 'revision_conflict')));
    const winner = won[0].json.receipt;
    assertEquals([winner.operation_type, winner.detail.before_text, winner.before_revision, winner.after_revision],
      ['detail.update', 'I can attend appointments on Fridays', 1, 2]);
    const [d] = await detailsOf(a);
    assertEquals([d.text, d.revision], [winner.detail.text, 2]);
    const stale = await apply(a, [detailUpdate(id, 'I can attend on Mondays', 1)]);
    assertEquals([stale.status, stale.json.detail?.expected, stale.json.detail?.actual], [409, 1, 2]);
    assertEquals((await detailsOf(a))[0].text, winner.detail.text);
    assertEquals(await contextDetails(a), [winner.detail.text]);
    // The first receipt keeps its own text and is historical now.
    const listed = await conversationActions(a, s.conversation_id);
    const cmd = listed.json.detail_commands.find((c: { message_id: number }) => c.message_id === s.message_id);
    assertEquals([cmd.receipt.detail.text, cmd.receipt.current], ['I can attend appointments on Fridays', false]);
    assertEquals(listed.json.commands, [], 'a detail receipt was listed where older clients read task receipts');
  },
});

Deno.test({
  name: 'every removal needs confirmation; Cancel sends nothing; a removed detail leaves later context at once',
  ...testOpts,
  fn: async () => {
    // Wrong if: an unconfirmed removal applies, the detail is still read by a later
    // answer after removal, or Undo restores it without its receipt's revision check.
    const a = await newAccount('details-remove');
    const s = await rememberedBy(a, 'I prefer phone calls to email');
    const id = s.receipt.detail.detail_id;
    const unconfirmed = await apply(a, [detailRemove(id, 1)]);
    assertEquals([unconfirmed.status, unconfirmed.json.reason], [403, 'removal_requires_confirmation']);
    assertEquals(await contextDetails(a), ['I prefer phone calls to email']);

    const removed = await apply(a, [detailRemove(id, 1)], { authorization: confirmed });
    assertEquals(removed.status, 200, JSON.stringify(removed.json));
    assertEquals([removed.json.receipt.operation_type, removed.json.receipt.detail.text, removed.json.receipt.detail.removed],
      ['detail.remove', 'I prefer phone calls to email', true]);
    assertEquals(await detailsOf(a), []);
    assertEquals(await contextDetails(a), [], 'a removed detail is still read as remembered context');

    // Undo of the removal restores it (no removal, no confirmation needed).
    const back = await undo(a, removed.json.operation_id);
    assertEquals(back.status, 200, JSON.stringify(back.json));
    assertEquals([back.json.receipt.kind, back.json.receipt.operation_type], ['undo', 'detail.restore']);
    assertEquals(await contextDetails(a), ['I prefer phone calls to email']);
    // The save's Undo would remove it: only with confirmation. The detail moved on
    // (removed and restored), so the removal is offered as a reviewed change.
    const unconfirmedUndo = await undo(a, s.operation_id);
    assertEquals([unconfirmedUndo.status, unconfirmedUndo.json.reason], [403, 'removal_requires_confirmation']);
    const undoSave = await undo(a, s.operation_id, { authorization: confirmed });
    assertEquals([undoSave.status, undoSave.json.error], [409, 'undo_conflict'], JSON.stringify(undoSave.json));
    assertEquals(undoSave.json.proposal.operations, [detailRemove(id, 3)]);
    const unconfirmedReview = await apply(a, undoSave.json.proposal.operations, { authorization: approved(undoSave.json.proposal) });
    assertEquals(unconfirmedReview.status, 403);
    const reviewed = await apply(a, undoSave.json.proposal.operations,
      { authorization: { ...approved(undoSave.json.proposal), removal_confirmed: true } });
    assertEquals(reviewed.status, 200, JSON.stringify(reviewed.json));
    assertEquals(await contextDetails(a), []);
    const twice = await undo(a, removed.json.operation_id);
    assertEquals([twice.status, twice.json.error], [409, 'already_undone']);

    // An unchanged save is undone directly, after confirmation.
    const s2 = await rememberedBy(a, 'I need an interpreter');
    const direct = await undo(a, s2.operation_id, { authorization: confirmed });
    assertEquals([direct.status, direct.json.receipt?.operation_type], [200, 'detail.remove'], JSON.stringify(direct.json));
    assertEquals(await contextDetails(a), []);
  },
});

Deno.test({
  name: 'Undo after a newer edit keeps the newer text and offers a reviewed change',
  ...testOpts,
  fn: async () => {
    // Wrong if: an old receipt's Undo overwrites a newer edit, or the reviewed change
    // applies without approval of its revision.
    const a = await newAccount('details-undo');
    const s = await rememberedBy(a, 'I can attend appointments on Fridays');
    const id = s.receipt.detail.detail_id;
    const e1 = await apply(a, [detailUpdate(id, 'I can attend appointments on Saturdays', 1)]);
    const e2 = await apply(a, [detailUpdate(id, 'I can attend appointments on Sundays', 2)]);
    assertEquals([e1.status, e2.status], [200, 200]);
    const u = await undo(a, e1.json.operation_id);
    assertEquals([u.status, u.json.error], [409, 'undo_conflict'], JSON.stringify(u.json));
    assertEquals(u.json.proposal.operations, [detailUpdate(id, 'I can attend appointments on Fridays', 3)]);
    assertEquals((await detailsOf(a))[0].text, 'I can attend appointments on Sundays', 'Undo overwrote a newer edit');
    const ok = await apply(a, u.json.proposal.operations, { authorization: approved(u.json.proposal) });
    assertEquals(ok.status, 200, JSON.stringify(ok.json));
    assertEquals(ok.json.receipt.detail.text, 'I can attend appointments on Fridays');
    const again = await apply(a, u.json.proposal.operations, { authorization: approved(u.json.proposal), operation_id: uuid() });
    assertEquals(again.status, 403, 'one approval applied twice');
  },
});

Deno.test({
  name: "another account can neither read, change, remove nor look up a detail",
  ...testOpts,
  fn: async () => {
    // Wrong if: any of B's requests shows or changes A's detail.
    const a = await newAccount('details-iso-a');
    const b = await newAccount('details-iso-b');
    const s = await rememberedBy(a, 'I need an interpreter for appointments');
    const id = s.receipt.detail.detail_id;
    assertEquals((await apply(b, [detailUpdate(id, 'changed', 1)])).status, 404);
    assertEquals((await apply(b, [detailRemove(id, 1)], { authorization: confirmed })).status, 404);
    assertEquals((await undo(b, s.operation_id, { authorization: confirmed })).status, 404);
    assertEquals((await status(b, s.operation_id)).json.status, 'not_applied');
    assertEquals(await detailsOf(b), []);
    assertEquals(await contextDetails(b), []);
    const direct = await b.client.from('companion_saved_details').update({ body: 'x' }).eq('id', id).select();
    assertEquals(direct.data ?? [], []);
    const insert = await b.client.from('companion_saved_details').insert({ user_id: b.id, body: 'x', source: {} });
    assert(insert.error, 'a client inserted a detail without the action service');
    assertEquals((await detailRows(a.id)).map(r => [r.body, r.revision]), [['I need an interpreter for appointments', 1]]);
  },
});

Deno.test({
  name: 'a lost reply is looked up; the same id replays once; a held operation is pending',
  ...testOpts,
  fn: async () => {
    // Wrong if: a retry with the same id saves a second edit, a reused id with another
    // payload applies, or the status of an in-flight write claims a result.
    const a = await newAccount('details-retry');
    const s = await rememberedBy(a, 'I prefer mornings');
    const id = s.receipt.detail.detail_id;
    const op = uuid();
    const first = await apply(a, [detailUpdate(id, 'I prefer afternoons', 1)], { operation_id: op });
    assertEquals(first.status, 200);
    const looked = await status(a, op);
    assertEquals([looked.json.status, looked.json.receipt.detail.text], ['applied', 'I prefer afternoons']);
    const replay = await apply(a, [detailUpdate(id, 'I prefer afternoons', 1)], { operation_id: op });
    assertEquals([replay.status, replay.json.replayed], [200, true]);
    assertEquals((await detailsOf(a))[0].revision, 2, 'a replay saved again');
    const reused = await apply(a, [detailUpdate(id, 'I prefer evenings', 2)], { operation_id: op });
    assertEquals([reused.status, reused.json.error], [409, 'operation_id_reused']);

    const held = uuid();
    const lock = holdOperationLock(a.id, held);
    await lock.ready;
    try {
      assertEquals((await status(a, held)).json.status, 'pending');
    } finally {
      await lock.release();
    }
    assertEquals((await status(a, held)).json.status, 'not_applied');
  },
});

Deno.test({
  name: 'a command and an approval of the same text, applied concurrently, save one detail',
  ...testOpts,
  fn: async () => {
    // Wrong if: two live details with the same text are saved. The approval is held on
    // its operation lock only until the command has entered the database, so the order
    // is bound: the command commits first, then the approval reads it.
    const a = await newAccount('details-race');
    const text = 'I need wheelchair access at appointments';
    const m = await said(a, `Remember that ${text}`);
    const p = await prepare(a, detailCreate(text), { source: { conversation_id: m.conversation_id } });
    const approvalId = uuid();
    const lock = holdOperationLock(a.id, approvalId);
    await lock.ready;
    const approval = apply(a, [detailCreate(text)], { authorization: approved(p.json.proposal), operation_id: approvalId });
    assert(await waitForBlocked(1, '%companion_apply_actions%') >= 1, 'the approval never reached the database');
    const byCommand = await apply(a, [detailCreate(text)], { authorization: command(m.message_id) });
    await lock.release();
    const second = await approval;
    assertEquals(byCommand.status, 200, JSON.stringify(byCommand.json));
    assertEquals([second.status, second.json.error], [409, 'needs_review'], JSON.stringify(second.json));
    assertEquals(second.json.proposal.context.same_text_details.length, 1);
    const reviewed = await apply(a, [detailCreate(text)], { authorization: approved(second.json.proposal) });
    assertEquals([reviewed.status, reviewed.json.error], [409, 'detail_exists'], JSON.stringify(reviewed.json));
    assertEquals((await detailRows(a.id)).filter(r => !r.removed).length, 1);

    // Unordered: both at once still save one.
    const b = await newAccount('details-race-b');
    const mb = await said(b, `Remember that ${text}`);
    const pb = await prepare(b, detailCreate(text), { source: { conversation_id: mb.conversation_id } });
    const both = await Promise.all([
      apply(b, [detailCreate(text)], { authorization: command(mb.message_id) }),
      apply(b, [detailCreate(text)], { authorization: approved(pb.json.proposal) }),
    ]);
    assertEquals(both.filter(r => r.status === 200).length, 1, JSON.stringify(both.map(r => [r.status, r.json.error])));
    assertEquals((await detailRows(b.id)).length, 1);
  },
});

Deno.test({
  name: 'with the feature gate off, saved details can be neither read nor changed through the action service',
  ...testOpts,
  fn: async () => {
    // Wrong if: the service serves or changes a detail while the feature is off. (rag-query
    // checks the same gate before it reads details: index_companion_context_test.ts.)
    const a = await newAccount('details-gate');
    const s = await rememberedBy(a, 'I prefer mornings');
    await sql`update public.companion_feature_gate set enabled = false`;
    try {
      assertEquals((await read(a)).status, 403);
      const edit = await apply(a, [detailUpdate(s.receipt.detail.detail_id, 'I prefer evenings', 1)]);
      assertEquals([edit.status, edit.json.error], [403, 'feature_disabled']);
    } finally {
      await openGate();
    }
    assertEquals(await contextDetails(a), ['I prefer mornings']);
  },
});

Deno.test({
  name: 'malformed detail operations are refused before any write',
  ...testOpts,
  fn: async () => {
    // Wrong if: an empty, multi-line, overlong or extra-field operation is stored.
    const a = await newAccount('details-malformed');
    const m = await said(a, 'Remember that x');
    for (const op of [
      { type: 'detail.create', text: '' },
      { type: 'detail.create', text: 'two\nlines' },
      { type: 'detail.create', text: 'y'.repeat(301) },
      { type: 'detail.create', text: 'x', scope: 'other' },
      { type: 'detail.update', detail_id: 'not-a-uuid', text: 'x', expected_revision: 1 },
      { type: 'detail.remove', detail_id: uuid() },
    ]) {
      const r = await apply(a, [op], { authorization: op.type === 'detail.create' ? command(m.message_id) : confirmed });
      assert(r.status === 422 || r.status === 403, `${JSON.stringify(op)} -> ${r.status}`);
    }
    const restore = await apply(a, [{ type: 'detail.restore', detail_id: uuid(), expected_revision: 1 }]);
    assertEquals(restore.status, 403, 'a direct control restored a detail');
    const raw = await call(a, { contract_version: 1, client: { platform: 'ios', app_version: '1' }, action: 'apply',
      operation_id: uuid(), authorization: command(m.message_id), operations: [detailCreate('x'), detailCreate('x')] });
    assertEquals(raw.status, 422);
    assertEquals(await detailRows(a.id), []);
  },
});
