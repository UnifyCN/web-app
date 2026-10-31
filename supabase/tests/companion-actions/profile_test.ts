// #371 public authenticated actions and persisted profile outcomes. Synthetic accounts only.
import { assertEquals } from 'jsr:@std/assert@1';
import { apply, approved, cancel, command, conversationActions, existingCustomTask, existingItem, interpret, newAccount, newItem, planApply, planPrepare, prepare, read, said, setState, sql, status, taskOf, testOpts, undo, uuid } from './support.ts';
import { readyProfile } from './profileSupport.ts';

await readyProfile();

Deno.test({
  name: 'profile: discussion writes nothing; an exact command saves the authoritative province once',
  ...testOpts,
  fn: async () => {
    // Wrong if discussion saves a fact, the command changes a different field, or retry duplicates its receipt.
    const a = await newAccount('profile-direct');
    const seed = await a.client.from('user_onboarding_profiles').insert({ id: a.id, province: 'British Columbia', city: 'Vancouver', arrival_date: '2026-11-07' });
    if (seed.error) throw seed.error;
    const discussion = await said(a, 'What would change if I arrived in Alberta on 2026-12-01?');
    assertEquals((await interpret(a, discussion.message_id)).json.command.kind, 'none');
    assertEquals((await a.client.from('user_onboarding_profiles').select('province').single()).data?.province, 'British Columbia');
    const m = await said(a, 'Update my profile province to AB');
    const i = await interpret(a, m.message_id);
    assertEquals(i.status, 200, JSON.stringify(i.json));
    assertEquals(i.json.command.kind, 'profile');
    assertEquals(i.json.command.before, 'British Columbia');
    assertEquals(i.json.command.operation.value, 'Alberta');
    const operation_id = uuid();
    const first = await apply(a, [i.json.command.operation], { operation_id, authorization: command(m.message_id) });
    assertEquals(first.status, 200, JSON.stringify(first.json));
    assertEquals(first.json.receipt.profile, { field: 'province', before: 'British Columbia', after: 'Alberta' });
    const retry = await apply(a, [i.json.command.operation], { operation_id, authorization: command(m.message_id) });
    assertEquals([retry.status, retry.json.replayed, retry.json.receipt.operation_id], [200, true, operation_id]);
    assertEquals((await status(a, operation_id)).json.status, 'applied');
    const saved = await a.client.from('user_onboarding_profiles').select('province,city').single();
    assertEquals(saved.data, { province: 'Alberta', city: 'Vancouver' });
    assertEquals((await read(a)).json.profile.province, 'Alberta');
    const later = await said(a, 'Help me settle in my saved province.');
    assertEquals(later.conversation_id === m.conversation_id, false);
    const fresh = await prepare(a, { type: 'task.create_custom', title: 'Synthetic new-conversation task', priority: 'Do soon' },
      { source: { conversation_id: later.conversation_id, message_id: later.message_id } });
    assertEquals(fresh.status, 200, JSON.stringify(fresh.json));
    assertEquals(fresh.json.proposal.context.profile.province, 'Alberta');
    assertEquals((await sql`select count(*)::int n from companion_saved_details where user_id=${a.id}`)[0].n, 0);
  },
});

Deno.test({name:'profile: legacy custom province remains recoverable by a reviewed Undo without widening new supported values',...testOpts,fn:async()=>{
  // Wrong if a valid older profile value is lost, or a new unsupported value can be prepared.
  const a=await newAccount('profile-legacy-value');
  await a.client.from('user_onboarding_profiles').insert({id:a.id,province:'Other region'}).throwOnError();
  const m=await said(a,'Update my profile province to Alberta');
  const op=(await interpret(a,m.message_id)).json.command.operation;
  const w=await apply(a,[op],{authorization:command(m.message_id)});
  assertEquals(w.status,200,JSON.stringify(w.json));
  await a.client.from('user_onboarding_profiles').update({province:'Quebec'}).eq('id',a.id).throwOnError();
  const u=await undo(a,w.json.receipt.operation_id);
  assertEquals([u.status,u.json.error],[409,'undo_conflict']);
  const saved=await apply(a,u.json.proposal.operations,{authorization:approved(u.json.proposal)});
  assertEquals(saved.status,200,JSON.stringify(saved.json));
  assertEquals((await read(a)).json.profile.province,'Other region');
  assertEquals((await prepare(a,{...op,value:'Other region'})).status,422);
} });

Deno.test({
  name: 'profile: relevant revisions invalidate old plan approval even after return to the same value; unrelated progress survives',
  ...testOpts,
  fn: async () => {
    // Wrong if old approval creates tasks after a relevant edit, or unrelated progress forces another review.
    const a = await newAccount('profile-relevance');
    const seed = await a.client.from('user_onboarding_profiles').insert({ id: a.id, province: 'British Columbia', city: 'Vancouver', arrival_date: '2026-11-07' });
    if (seed.error) throw seed.error;
    const task = await existingCustomTask(a, 'Synthetic existing SIN task');
    const draft = await planPrepare(a, 'Synthetic settlement plan', [existingItem(task.ref), newItem('Synthetic phone task')]);
    assertEquals(draft.status, 200, JSON.stringify(draft.json));
    for (const province of ['Ontario', 'British Columbia']) {
      const legacy = await a.client.from('user_onboarding_profiles').update({ province }).eq('id', a.id);
      if (legacy.error) throw legacy.error;
    }
    const blocked = await planApply(a, draft.json.plan_proposal);
    assertEquals([blocked.status, blocked.json.error], [409, 'needs_review'], JSON.stringify(blocked.json));
    const revised = blocked.json.plan_proposal;
    assertEquals(revised.context.profile.province, 'British Columbia');
    const state = await taskOf(a, task.ref);
    assertEquals((await apply(a, [setState(task.ref, 'completed', state.revision)])).status, 200);
    const preference = await a.client.from('user_onboarding_profiles').update({ wants_reminders: true, persona: 'skilled_worker' }).eq('id', a.id);
    if (preference.error) throw preference.error;
    const saved = await planApply(a, revised);
    assertEquals(saved.status, 200, JSON.stringify(saved.json));
    assertEquals((await taskOf(a, task.ref)).state, 'completed');
  },
});

Deno.test({
  name: 'profile: arrival date preserves calendar stage; Undo keeps a newer edit and offers a reviewed change',
  ...testOpts,
  fn: async () => {
    // Wrong if a date changes the province, Undo overwrites a newer date, or compensation skips review.
    const a = await newAccount('profile-undo');
    const seed = await a.client.from('user_onboarding_profiles').insert({ id: a.id, province: 'British Columbia', arrival_date: '2026-11-07' });
    if (seed.error) throw seed.error;
    const m = await said(a, 'Update my profile arrival date to 2026-12-01');
    const i = await interpret(a, m.message_id);
    assertEquals(i.json.command.kind, 'profile', JSON.stringify(i.json));
    const save = await apply(a, [i.json.command.operation], { authorization: command(m.message_id) });
    assertEquals(save.status, 200, JSON.stringify(save.json));
    assertEquals(save.json.receipt.profile, { field: 'arrival_date', before: '2026-11-07', after: '2026-12-01' });
    const legacy = await a.client.from('user_onboarding_profiles').update({ arrival_date: '2027-01-01' }).eq('id', a.id);
    if (legacy.error) throw legacy.error;
    const reversal = await undo(a, save.json.receipt.operation_id);
    assertEquals([reversal.status, reversal.json.error], [409, 'undo_conflict'], JSON.stringify(reversal.json));
    assertEquals((await read(a)).json.profile.arrival_date, '2027-01-01');
    const p = reversal.json.proposal;
    assertEquals(p.context.value, '2027-01-01');
    assertEquals(p.operations[0].value, '2026-11-07');
    const confirmed = await apply(a, p.operations, { authorization: approved(p) });
    assertEquals(confirmed.status, 200, JSON.stringify(confirmed.json));
    assertEquals(confirmed.json.receipt.kind, 'undo');
    assertEquals((await undo(a, save.json.receipt.operation_id)).json.error, 'already_undone');
    assertEquals((await read(a)).json.profile.arrival_date, '2026-11-07');
    assertEquals((await read(a)).json.profile.province, 'British Columbia');
    const next = await said(a, 'Update my profile province to Ontario');
    const op = (await interpret(a, next.message_id)).json.command.operation;
    const w = await apply(a, [op], { authorization: command(next.message_id) });
    assertEquals((await undo(a, w.json.receipt.operation_id)).status, 200);
    assertEquals((await read(a)).json.profile.province, 'British Columbia');
  },
});

Deno.test({
  name: 'profile: an arrived date changes the derived stage and current Undo restores the missing date',
  ...testOpts,
  fn: async () => {
    // Wrong if an arrived date stays pre-arrival, changes the province, or Undo loses the original missing date.
    const a=await newAccount('profile-stage');
    await a.client.from('user_onboarding_profiles').insert({id:a.id,province:'British Columbia',arrival_date:null,stage:0}).throwOnError();
    const [{arrived}]=await sql`select (current_date-400)::text arrived`;
    const message=await said(a,'Update my profile arrival date to '+arrived);
    const operation=(await interpret(a,message.message_id)).json.command.operation;
    const saved=await apply(a,[operation],{authorization:command(message.message_id)});
    assertEquals(saved.status,200,JSON.stringify(saved.json));
    const actual=await a.client.from('user_onboarding_profiles').select('arrival_date,stage,province').single();
    assertEquals(actual.data?.arrival_date.slice(0,10),arrived);
    assertEquals([Number(actual.data?.stage),actual.data?.province],[3,'British Columbia']);
    assertEquals((await undo(a,saved.json.receipt.operation_id)).status,200);
    const restored=await a.client.from('user_onboarding_profiles').select('arrival_date,stage,province').single();
    assertEquals(restored.data,{arrival_date:null,stage:0,province:'British Columbia'});
  },
});

Deno.test({
  name: 'profile: proposal shows authoritative old/proposed values and changes only after fresh approval',
  ...testOpts,
  fn: async () => {
    // Wrong if preparation writes, a legacy change permits old approval, or unrelated fields force review.
    const a = await newAccount('profile-review');
    const seed = await a.client.from('user_onboarding_profiles').insert({ id: a.id, province: 'British Columbia', arrival_date: '2026-11-07' });
    if (seed.error) throw seed.error;
    const source = await said(a, 'I am considering Alberta.');
    const op = { type: 'profile.update', field: 'province', value: 'Alberta', expected_revision: 1 };
    const p = await prepare(a, op, { source: { conversation_id: source.conversation_id } });
    assertEquals(p.status, 200, JSON.stringify(p.json));
    assertEquals(p.json.proposal.context, { field: 'province', value: 'British Columbia', revision: 1 });
    assertEquals((await read(a)).json.profile.province, 'British Columbia');
    const listed = await conversationActions(a, source.conversation_id);
    assertEquals(listed.json.profile_proposals[0].proposal_id, p.json.proposal.proposal_id);
    // Older installed client writes through PostgREST. The caller cannot forge its revision.
    const legacy = await a.client.from('user_onboarding_profiles').update({ province: 'Ontario', companion_field_revisions: { province: 1 } }).eq('id', a.id);
    if (legacy.error) throw legacy.error;
    const changed = await apply(a, [op], { authorization: approved(p.json.proposal) });
    assertEquals([changed.status, changed.json.error], [409, 'needs_review'], JSON.stringify(changed.json));
    const revised = changed.json.proposal;
    assertEquals(revised.context, { field: 'province', value: 'Ontario', revision: 2 });
    assertEquals(revised.previous_context.value, 'British Columbia');
    assertEquals(revised.operations[0].expected_revision, 2);
    assertEquals((await read(a)).json.profile.province, 'Ontario');
    const unrelated = await a.client.from('user_onboarding_profiles').update({ wants_reminders: true }).eq('id', a.id);
    if (unrelated.error) throw unrelated.error;
    const saved = await apply(a, revised.operations, { authorization: approved(revised) });
    assertEquals(saved.status, 200, JSON.stringify(saved.json));
    assertEquals(saved.json.receipt.profile, { field: 'province', before: 'Ontario', after: 'Alberta' });
    const rejected = await prepare(a, { ...op, value: 'Quebec', expected_revision: 3 }, { source: { conversation_id: source.conversation_id } });
    assertEquals((await cancel(a, rejected.json.proposal.proposal_id, rejected.json.proposal.proposal_revision)).status, 200);
    assertEquals((await read(a)).json.profile.province, 'Alberta');
  },
});
