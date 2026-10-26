// The public action boundary refuses what it must and keeps one outcome per
// operation identity (mobile-app#361). Real HTTP, real JWTs, real Postgres.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import {
  ANON_KEY, apply, call, existingCustomTask, existingSanityTask, holdOperationLock, newAccount, openGate, read, ready,
  setState, sql, status, taskOf, testOpts, undo, uuid, waitForBlocked,
} from './support.ts';

await ready();

const receiptsOf = async (who: { id: string }) =>
  (await sql`select count(*)::int n from companion_action_receipts where user_id = ${who.id}`)[0].n as number;

Deno.test({ name: 'wrong account: no token, project key, forged token, or another account\'s task', ...testOpts, fn: async () => {
  const a = await newAccount('alice');
  const b = await newAccount('bob');
  const { ref } = await existingCustomTask(a, 'Alice private');
  const t = await taskOf(a, ref);
  const body = { contract_version: 1, client: { platform: 'ios', app_version: '1' }, action: 'read' };
  assertEquals((await call(null, body)).status, 401, 'project key is not an identity');
  assertEquals((await call(null, body, 'not-a-jwt')).status, 401);
  const forged = a.jwt.split('.').slice(0, 2).join('.') + '.' + 'A'.repeat(43);
  assertEquals((await call(null, body, forged)).status, 401, 'a token with a forged signature');

  // B names A's task: refused as not found; A's task and receipts unchanged.
  const cross = await apply(b, [setState(ref, 'completed', t.revision)]);
  assertEquals([cross.status, cross.json.reason], [404, 'task_not_found']);
  assertEquals((await taskOf(a, ref)).state, 'not_started');
  assertEquals(await receiptsOf(b), 0);
  // A body that claims another owner is ignored: the account comes from the JWT.
  const claim = await call(b, { ...body, action: 'apply', user_id: a.id, operation_id: uuid(),
    authorization: { kind: 'ui_control' }, operations: [setState('sanity:bank', 'in_progress', 0)] });
  assertEquals(claim.status, 200, JSON.stringify(claim.json));
  assertEquals(await taskOf(a, 'sanity:bank'), undefined);
  assertEquals((await taskOf(b, 'sanity:bank')).state, 'in_progress');
  // The same content-backed id is a separate task per account.
  await existingSanityTask(a, 'shared-id');
  const aShared = await taskOf(a, 'sanity:shared-id');
  assertEquals((await apply(b, [setState('sanity:shared-id', 'completed', 0)])).status, 200);
  assertEquals((await taskOf(a, 'sanity:shared-id')).revision, aShared.revision);
  // Direct writes and RPC calls with the user's JWT are refused.
  for (const table of ['companion_action_receipts', 'companion_proposals', 'companion_feature_gate', 'companion_task_reminders']) {
    const r = await b.client.from(table).insert({ user_id: b.id } as never);
    assert(r.error, `insert into ${table} must fail`);
  }
  const rpc = await b.client.rpc('companion_apply_actions', {
    p_user_id: a.id, p_operation_id: uuid(), p_contract_version: 1,
    p_authorization: { kind: 'ui_control' }, p_operations: [setState(ref, 'completed', t.revision)],
  });
  assert(rpc.error, 'direct RPC must fail');
  assertEquals((await taskOf(a, ref)).state, 'not_started');
}});

Deno.test({ name: 'forged or model-made approval is refused and writes nothing', ...testOpts, fn: async () => {
  const a = await newAccount('alice');
  const b = await newAccount('bob');
  const { ref } = await existingCustomTask(a, 'Get your SIN');
  const t0 = await taskOf(a, ref);
  const first = await apply(a, [setState(ref, 'in_progress', t0.revision)]);
  await apply(a, [setState(ref, 'waiting', first.json.receipt.after_revision)]);
  const conflict = await undo(a, first.json.operation_id);
  assertEquals(conflict.status, 409);
  const { proposal_id, proposal_revision, operations } = conflict.json.proposal;
  const good = { kind: 'approved_proposal', proposal_id, proposal_revision };
  const before = await taskOf(a, ref);
  const n0 = await receiptsOf(a);

  const cases: Array<[string, unknown, unknown[], number]> = [
    ['tampered operations', good, [{ ...operations[0], state: 'completed' }], 403],
    ['wrong proposal revision', { ...good, proposal_revision: proposal_revision + 1 }, operations, 403],
    ['unknown proposal', { ...good, proposal_id: uuid() }, operations, 403],
    ['model approval flag', { approved: true }, operations, 403],
    ['kind with approval flag', { kind: 'model', approved: true }, operations, 403],
    ['direct command (not accepted in this slice)', { kind: 'direct_command', message_id: 1 }, operations, 403],
    ['missing authorization', null, operations, 403],
  ];
  for (const [label, authorization, ops, expected] of cases) {
    const r = await apply(a, ops, { authorization });
    assertEquals(r.status, expected, `${label}: ${JSON.stringify(r.json)}`);
  }
  // Another account cannot use A's proposal, even with A's exact operations.
  const stolen = await apply(b, operations, { authorization: good });
  assert(stolen.status === 403 || stolen.status === 404, `stolen proposal: ${stolen.status}`);
  const after = await taskOf(a, ref);
  assertEquals([after.state, after.revision], [before.state, before.revision]);
  assertEquals(await receiptsOf(a), n0);
  // The genuine approval still works once, then never again.
  assertEquals((await apply(a, operations, { authorization: good })).status, 200);
  const reuse = await apply(a, operations, { authorization: good });
  assertEquals(reuse.status, 403);
}});

Deno.test({ name: 'invalid contract versions and platforms are refused before any write', ...testOpts, fn: async () => {
  const a = await newAccount('alice');
  const ref = await existingSanityTask(a, 'sin');
  const op = { action: 'apply', operation_id: uuid(), authorization: { kind: 'ui_control' }, operations: [setState(ref, 'completed', 1)] };
  for (const version of [2, 0, '1', null, 1.5]) {
    const r = await call(a, { contract_version: version, client: { platform: 'ios', app_version: '1' }, ...op });
    assertEquals(r.status, 426, `version ${version}`);
    assertEquals(r.json.supported, { min: 1, max: 1 });
  }
  const noVersion = await call(a, { client: { platform: 'ios' }, ...op });
  assertEquals(noVersion.status, 426);
  for (const platform of ['desktop', undefined, 7]) {
    const r = await call(a, { contract_version: 1, client: { platform }, ...op });
    assertEquals([r.status, r.json.error], [403, 'platform_not_enabled'], `platform ${platform}`);
  }
  assertEquals((await taskOf(a, ref)).state, 'not_started');
  assertEquals(await receiptsOf(a), 0);
}});

Deno.test({ name: 'invalid payloads are 4xx, never 500, and write nothing', ...testOpts, fn: async () => {
  const a = await newAccount('alice');
  const ref = await existingSanityTask(a, 'sin');
  const { ref: cref } = await existingCustomTask(a);
  const rev = (await taskOf(a, ref)).revision;
  const bad: Array<[string, unknown[], number, string]> = [
    ['unimplemented operation', [{ type: 'task.remove', task_ref: ref, expected_revision: rev }], 422, 'unsupported_operation'],
    ['create is not in this slice', [{ type: 'task.create_custom', title: 'x', priority: 'Do now' }], 422, 'unsupported_operation'],
    // Names every JavaScript object inherits must not resolve to a registry entry.
    ...['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf'].map((type) =>
      [`inherited name ${type}`, [{ type, task_ref: ref, expected_revision: rev }], 422, 'unsupported_operation'] as
        [string, unknown[], number, string]),
    ['padded custom ref', [setState(cref.replace('custom:', 'custom:0'), 'waiting', 1)], 422, 'invalid_task_ref'],
    ['draft sanity ref', [setState('sanity:drafts.sin', 'waiting', 1)], 422, 'invalid_task_ref'],
    ['null state', [{ type: 'task.set_state', task_ref: ref, state: null, expected_revision: rev }], 422, 'invalid_state'],
    ['unknown state', [setState(ref, 'done', rev)], 422, 'invalid_state'],
    ['missing revision', [{ type: 'task.set_state', task_ref: ref, state: 'waiting' }], 422, 'expected_revision_required'],
    ['negative revision', [setState(ref, 'waiting', -1)], 422, 'expected_revision_required'],
    ['fractional revision', [setState(ref, 'waiting', 1.5)], 422, 'expected_revision_required'],
    ['reason too long', [setState(ref, 'waiting', rev, 'x'.repeat(501))], 422, 'invalid_waiting_reason'],
    ['reason on another state', [setState(ref, 'in_progress', rev, 'why')], 422, 'invalid_waiting_reason'],
    ['reason not a string', [{ ...setState(ref, 'waiting', rev), waiting_reason: 5 }], 422, 'invalid_waiting_reason'],
    ['unknown field', [{ ...setState(ref, 'waiting', rev), owner: 'x' }], 422, 'unknown_field'],
    ['two operations', [setState(ref, 'waiting', rev), setState(cref, 'waiting', 1)], 422, 'invalid_operations'],
    ['no operations', [], 422, 'invalid_operations'],
  ];
  for (const [label, ops, code, reason] of bad) {
    const r = await apply(a, ops);
    assertEquals([r.status, r.json.reason], [code, reason], `${label}: ${JSON.stringify(r.json)}`);
  }
  const notJson = await call(a, '{not json');
  assertEquals(notJson.status, 400);
  const badOp = await call(a, { contract_version: 1, client: { platform: 'ios' }, action: 'apply', operation_id: 'x',
    authorization: { kind: 'ui_control' }, operations: [setState(ref, 'waiting', rev)] });
  assertEquals(badOp.status, 400);
  const badAction = await call(a, { contract_version: 1, client: { platform: 'ios' }, action: 'prepare', operations: [] });
  assertEquals([badAction.status, badAction.json.reason], [400, 'invalid_action']);
  // Defence in depth: the SQL registry refuses an unregistered type even from a
  // service-role caller that skipped the handler's parser.
  for (const op of [{ type: 'task.remove', task_ref: ref, expected_revision: rev },
                    { type: 'task.create_custom', title: 'x', priority: 'Do now' },
                    { type: 'constructor', task_ref: ref, expected_revision: rev }]) {
    const err = await sql`select public.companion_apply_actions(${a.id}::uuid, ${uuid()}::uuid, 1,
        ${sql.json({ kind: 'ui_control' })}, ${sql.json([op])})`.then(() => null, e => e);
    assertEquals([err?.code, err?.message], ['CA422', 'unsupported_operation'], JSON.stringify(op));
  }
  assertEquals(await receiptsOf(a), 0);
  // A long but valid reason is accepted; 500 characters exactly.
  assertEquals((await apply(a, [setState(ref, 'waiting', rev, 'y'.repeat(500))])).status, 200);
  assertEquals(await receiptsOf(a), 1);
}});

Deno.test({ name: 'a stale revision is a conflict that names expected and actual, and writes nothing', ...testOpts, fn: async () => {
  const a = await newAccount('alice');
  const { ref, id } = await existingCustomTask(a);
  const t0 = await taskOf(a, ref);
  // Another device changed the task (legacy Checklist write).
  await a.client.from('custom_checklist_tasks').update({ title: 'Renamed elsewhere' }).eq('id', id);
  const op = uuid();
  const r = await apply(a, [setState(ref, 'waiting', t0.revision, 'x')], { operation_id: op });
  assertEquals([r.status, r.json.error], [409, 'revision_conflict']);
  assertEquals(r.json.detail, { task_ref: ref, expected: t0.revision, actual: t0.revision + 1 });
  assertEquals((await taskOf(a, ref)).state, 'not_started');
  // Confirmed not applied. A retry with the same identity re-checks the revision and is refused again.
  assertEquals((await status(a, op)).json.status, 'not_applied');
  const retry = await apply(a, [setState(ref, 'waiting', t0.revision, 'x')], { operation_id: op });
  assertEquals(retry.status, 409);
  assertEquals(await receiptsOf(a), 0);
  // With the current revision, the same identity may now carry the corrected request.
  const fixed = await apply(a, [setState(ref, 'waiting', t0.revision + 1, 'x')], { operation_id: op });
  assertEquals(fixed.status, 200);
}});

Deno.test({ name: 'one operation identity: repeat taps and concurrent retries produce one write and one outcome', ...testOpts, fn: async () => {
  const a = await newAccount('alice');
  const ref = await existingSanityTask(a, 'bank');
  const t0 = await taskOf(a, ref);
  const op = uuid();
  const ops = [setState(ref, 'in_progress', t0.revision)];
  const replies = await Promise.all(Array.from({ length: 10 }, () => apply(a, ops, { operation_id: op })));
  assertEquals(replies.map(r => r.status), Array(10).fill(200), JSON.stringify(replies.map(r => r.json)));
  assertEquals(replies.filter(r => r.json.replayed === false).length, 1);
  assertEquals(new Set(replies.map(r => r.json.receipt.after_revision)).size, 1);
  assertEquals(await receiptsOf(a), 1);
  assertEquals((await taskOf(a, ref)).revision, t0.revision + 1);
  // Same identity, different payload: refused, never applied.
  const reused = await apply(a, [setState(ref, 'completed', t0.revision + 1)], { operation_id: op });
  assertEquals([reused.status, reused.json.error], [409, 'operation_id_reused']);
  assertEquals((await taskOf(a, ref)).state, 'in_progress');
  // Identity is scoped to the account.
  const b = await newAccount('bob');
  assertEquals((await status(b, op)).json.status, 'not_applied');
}});

Deno.test({ name: 'result lookup: applied after a lost response, pending while in flight, not applied otherwise', ...testOpts, fn: async () => {
  const a = await newAccount('alice');
  const ref = await existingSanityTask(a, 'phone');
  const t0 = await taskOf(a, ref);
  // Applied: the client never read the response; lookup returns the recorded receipt.
  const lost = uuid();
  const ops = [setState(ref, 'waiting', t0.revision, 'Carrier store visit')];
  await apply(a, ops, { operation_id: lost });
  const s = await status(a, lost);
  assertEquals([s.status, s.json.status, s.json.receipt.after_state], [200, 'applied', 'waiting']);
  const retry = await apply(a, ops, { operation_id: lost });
  assertEquals([retry.status, retry.json.replayed], [200, true]);
  assertEquals(await receiptsOf(a), 1);

  // Pending: another attempt holds the operation. Lookup must not say "not applied".
  const inFlight = uuid();
  const hold = holdOperationLock(a.id, inFlight);
  await hold.ready;
  try {
    const p = await status(a, inFlight);
    assertEquals(p.json.status, 'pending');
    // A write attempt while it is held waits, then reports an unknown outcome instead of a second write.
    const blocked = apply(a, [setState(ref, 'in_progress', t0.revision + 1)], { operation_id: inFlight });
    assertEquals(await waitForBlocked(1, '%companion_apply_actions%'), 1);
    const blockedReply = await blocked;
    assertEquals([blockedReply.status, blockedReply.json.error], [503, 'operation_in_flight']);
    assertEquals(blockedReply.headers.get('retry-after'), '1');
  } finally {
    await hold.release();
  }
  assertEquals((await status(a, inFlight)).json.status, 'not_applied');
  assertEquals((await taskOf(a, ref)).state, 'waiting');
}});

Deno.test({ name: 'task controls, lookup and Undo work at the AI limit and never touch the generation quota', ...testOpts, fn: async () => {
  const a = await newAccount('alice');
  await sql`insert into chatbot_usage (user_id, message_count, last_message_at) values (${a.id}, 6, now())`;
  const [{ n: calls0 }] = await sql`select count(*)::int n from quota_tripwire_calls`;
  const ref = await existingSanityTask(a, 'sin');
  const t0 = await taskOf(a, ref);
  const w = await apply(a, [setState(ref, 'completed', t0.revision)]);
  assertEquals(w.status, 200);
  assertEquals((await status(a, w.json.operation_id)).json.status, 'applied');
  assertEquals((await undo(a, w.json.operation_id)).status, 200);
  assertEquals((await read(a)).status, 200);
  const [{ n: calls1 }] = await sql`select count(*)::int n from quota_tripwire_calls`;
  assertEquals(calls1, calls0, 'the action endpoint called a generation-quota function');
}});

Deno.test({ name: 'gate: off refuses and writes nothing; a gate-only toggle stops no reminder', ...testOpts, fn: async () => {
  const a = await newAccount('alice');
  const ref = await existingSanityTask(a, 'sin');
  const t0 = await taskOf(a, ref);
  const [rem] = await sql`insert into companion_task_reminders (user_id, task_ref, remind_at, time_zone)
    values (${a.id}, ${ref}, now() + interval '2 days', 'America/Toronto') returning id`;
  await sql`update companion_feature_gate set enabled = false`;
  try {
    const off = await apply(a, [setState(ref, 'completed', t0.revision)]);
    assertEquals([off.status, off.json.error], [403, 'feature_disabled']);
    assertEquals((await call(a, { contract_version: 1, client: { platform: 'web' }, action: 'read' })).status, 403);
    // Legacy Checklist writes do not depend on the gate.
    const legacy = await a.client.from('user_tasks').update({ completed: false }).eq('sanity_checklist_id', 'sin');
    assertEquals(legacy.error, null);
    await openGate({ allowed_platforms: '{ios}' });
    const web = await call(a, { contract_version: 1, client: { platform: 'web' }, action: 'read' });
    assertEquals([web.status, web.json.error], [403, 'platform_not_enabled']);
  } finally {
    await openGate();
  }
  const [r] = await sql`select status from companion_task_reminders where id = ${rem.id}`;
  assertEquals(r.status, 'pending');
  assertEquals(await receiptsOf(a), 0);
}});

Deno.test({ name: 'only POST is served', ...testOpts, fn: async () => {
  const a = await newAccount('alice');
  const res = await fetch(`${Deno.env.get('ACTIONS_API_URL')}/functions/v1/companion-actions`, {
    method: 'GET', headers: { apikey: ANON_KEY, authorization: `Bearer ${a.jwt}` },
  });
  await res.body?.cancel();
  assertEquals(res.status, 405);
}});

Deno.test({ name: 'cleanup', ...testOpts, fn: async () => { await sql.end(); } });
