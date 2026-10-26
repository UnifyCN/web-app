// The production migration keeps the compatibility and rollback policy accepted in
// #360 (mobile-app#361). Starts on the hosted-shape baseline: run.sh resets the
// database before each file. Legacy client calls are the exact PostgREST shapes the
// released mobile and web Checklist services send.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import {
  type Account, apply, migrate, migrationApplied, newAccount, openGate, read, setState, sql, status, taskOf, testOpts,
  undo,
} from './support.ts';

const iso = () => new Date().toISOString();
const strip = (row: Record<string, unknown> | null | undefined, keep: string[]) =>
  row ? Object.fromEntries(keep.map(k => [k, row[k] ?? null])) : row;
const dbNow = async () => (await sql`select clock_timestamp() t`)[0].t.getTime() as number;

async function legacyScenario(a: Account) {
  const out: Record<string, unknown> = {};
  const done = (r: { error: { message: string } | null }) => r.error?.message ?? 'ok';
  out.complete = done(await a.client.from('user_tasks').upsert({ user_id: a.id, task_id: null, sanity_checklist_id: 's1', completed: true, completed_at: iso() }, { onConflict: 'user_id,sanity_checklist_id' }));
  out.uncheck = done(await a.client.from('user_tasks').update({ completed: false, completed_at: null }).eq('user_id', a.id).eq('sanity_checklist_id', 's1'));
  out.dismiss = done(await a.client.from('user_tasks').upsert({ user_id: a.id, sanity_checklist_id: 's2', dismissed_at: iso() }, { onConflict: 'user_id,sanity_checklist_id' }));
  out.undismiss = done(await a.client.from('user_tasks').upsert({ user_id: a.id, sanity_checklist_id: 's2', dismissed_at: null }, { onConflict: 'user_id,sanity_checklist_id' }));
  out.ensure = done(await a.client.from('user_tasks').insert([{ user_id: a.id, task_id: null, sanity_checklist_id: 's3', completed: false }, { user_id: a.id, task_id: null, sanity_checklist_id: 's4', completed: false }]));
  const tasks = await a.client.from('user_tasks').select(`user_task_id, user_id, task_id, sanity_checklist_id, completed, completed_at, dismissed_at,
    task:personalized_checklist_tasks!user_tasks_task_id_fkey (id, persona, stage, priority, task_name, task_description, task_module)`).eq('user_id', a.id).order('sanity_checklist_id');
  if (tasks.error) throw new Error(`getUserTasks shape failed: ${tasks.error.message}`);
  out.userTasks = tasks.data?.map(r => strip(r, ['sanity_checklist_id', 'completed', 'dismissed_at']));
  const created = await a.client.from('custom_checklist_tasks').insert({ user_id: a.id, priority: 'Do soon', title: 'Phone plan', description: '' }).select('*').single();
  out.createCustom = created.error?.message ?? 'ok';
  if (!created.data) return out;
  const id = created.data.id;
  out.customShape = strip(created.data, ['priority', 'title', 'description', 'completed', 'completed_at']);
  out.customComplete = done(await a.client.from('custom_checklist_tasks').update({ completed: true, completed_at: iso() }).eq('id', id).eq('user_id', a.id));
  out.customList = (await a.client.from('custom_checklist_tasks').select('*').eq('user_id', a.id)).data?.map(r => strip(r, ['title', 'completed']));
  out.customUncheck = done(await a.client.from('custom_checklist_tasks').update({ completed: false, completed_at: null }).eq('id', id).eq('user_id', a.id));
  out.customDelete = done(await a.client.from('custom_checklist_tasks').delete().eq('id', id).eq('user_id', a.id));
  out.customAfterDelete = (await a.client.from('custom_checklist_tasks').select('id').eq('user_id', a.id)).data?.length;
  out.order = done(await a.client.from('checklist_task_order').upsert({ user_id: a.id, priority: 'Do now', ordered_keys: ['sanity:s1'] }, { onConflict: 'user_id,priority' }));
  return out;
}

async function seeded(label: string) {
  const a = await newAccount(label);
  await sql`insert into user_tasks (user_id, sanity_checklist_id, completed, completed_at) values (${a.id}, 'seed-done', true, now()), (${a.id}, 'seed-open', false, null)`;
  await sql`insert into custom_checklist_tasks (user_id, priority, title, completed, completed_at) values (${a.id}, 'Do now', 'seed custom done', true, now()), (${a.id}, 'Do soon', 'seed custom open', false, null)`;
  return a;
}

async function legacySnapshot(a: Account) {
  const ut = await sql`select sanity_checklist_id, completed, completed_at is not null as has_completed_at, dismissed_at is not null as dismissed from user_tasks where user_id = ${a.id} order by user_task_id`;
  const ct = await sql`select title, priority, completed, completed_at is not null as has_completed_at from custom_checklist_tasks where user_id = ${a.id} order by id`;
  return { ut: ut.map(r => ({ ...r })), ct: ct.map(r => ({ ...r })) };
}

const reminders = async (a: Account) =>
  (await sql`select id, task_ref, status, cancelled_reason, cancelled_at from companion_task_reminders
               where user_id = ${a.id} order by task_ref`).map(r => ({ ...r }));

async function roundTrip() {
  await sql`update companion_feature_gate set enabled = false`;
  await migrate('down');
  await migrate('up');
  await openGate();
}

Deno.test({ name: 'legacy Checklist calls and existing rows are identical on the baseline, after up, after down and after up again', ...testOpts, fn: async () => {
  assert(!(await migrationApplied()), 'run.sh must reset to the baseline first');
  const pre = await seeded('pre');
  const baseline = await legacyScenario(await seeded('baseline'));
  const beforeUp = await legacySnapshot(pre);
  await migrate('up');
  await openGate();
  assertEquals(await legacySnapshot(pre), beforeUp, 'up changed a legacy column of an existing row');
  assertEquals(await legacyScenario(await seeded('up')), baseline);
  // Existing rows map onto the four states with no backfill.
  const tasks = (await read(pre)).json.tasks;
  const state = (ref: string) => tasks.find((t: any) => t.task_ref === ref)?.state;
  assertEquals([state('sanity:seed-done'), state('sanity:seed-open')], ['completed', 'not_started']);

  const w = await apply(pre, [setState('sanity:seed-open', 'waiting', 1, 'Letter')]);
  assertEquals(w.status, 200, JSON.stringify(w.json));
  await sql`update companion_feature_gate set enabled = false`;
  await migrate('down');
  assertEquals(await legacyScenario(await seeded('down')), baseline);
  const [pol] = await sql`select qual from pg_policies where policyname = 'Users can read own custom checklist tasks'`;
  assertEquals(pol.qual, '(auth.uid() = user_id)');
  await migrate('up');
  await openGate();
  assertEquals(await legacyScenario(await seeded('upagain')), baseline);
}});

Deno.test({ name: 'the migration ships the feature off; API roles cannot execute the action SQL', ...testOpts, fn: async () => {
  if (await migrationApplied()) await migrate('down');
  await migrate('up');
  const [g] = await sql`select enabled, min_contract_version, max_contract_version from companion_feature_gate`;
  assertEquals([g.enabled, g.min_contract_version, g.max_contract_version], [false, 1, 1]);
  const fns = await sql`
    select p.proname, has_function_privilege('anon', p.oid, 'execute') anon,
           has_function_privilege('authenticated', p.oid, 'execute') authed,
           has_function_privilege('service_role', p.oid, 'execute') svc
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'companion\\_%'`;
  assert(fns.length > 10);
  for (const f of fns) assertEquals([f.proname, f.anon, f.authed], [f.proname, false, false]);
  for (const name of ['companion_apply_actions', 'companion_undo_action', 'companion_action_status', 'companion_read_tasks']) {
    assert(fns.find(f => f.proname === name)?.svc, `${name} must be executable by the service role`);
  }
  await openGate();
}});

Deno.test({ name: 'receipts, waiting reasons and Undo survive a rollback and re-application; held revisions go stale', ...testOpts, fn: async () => {
  if (!(await migrationApplied())) await migrate('up');
  await openGate();
  const a = await newAccount('alice');
  await sql`insert into user_tasks (user_id, sanity_checklist_id) values (${a.id}, 'sin')`;
  const w = await apply(a, [setState('sanity:sin', 'waiting', 1, 'Letter from Service Canada')]);
  assertEquals(w.status, 200);
  await roundTrip();
  const t = await taskOf(a, 'sanity:sin');
  assertEquals([t.state, t.waiting_reason], ['waiting', 'Letter from Service Canada']);
  assertEquals(t.revision, w.json.receipt.after_revision + 1, 'every revision held from before the rollback must be stale');
  const s = await status(a, w.json.operation_id);
  assertEquals(s.json.status, 'applied');
  const retry = await apply(a, [setState('sanity:sin', 'waiting', 1, 'Letter from Service Canada')], { operation_id: w.json.operation_id });
  assertEquals([retry.status, retry.json.replayed], [200, true]);
  const [{ n }] = await sql`select count(*)::int n from companion_action_receipts where user_id = ${a.id}`;
  assertEquals(n, 1);
  // Undo of the pre-rollback receipt cannot apply blindly: it asks for review.
  const u = await undo(a, w.json.operation_id);
  assertEquals([u.status, u.json.error], [409, 'undo_conflict']);
  assertEquals((await taskOf(a, 'sanity:sin')).state, 'waiting');
}});

Deno.test({ name: 'a full rollback stops every pending reminder; re-application restarts none; history stays exact', ...testOpts, fn: async () => {
  if (!(await migrationApplied())) await migrate('up');
  await openGate();
  const a = await newAccount('policy');
  // Reminders as the reminder slice will write them (service role).
  const refs = ['sanity:untouched', 'sanity:reopened', 'sanity:done-before', 'sanity:sent-before'];
  for (const ref of refs) await sql`insert into user_tasks (user_id, sanity_checklist_id) values (${a.id}, ${ref.slice(7)})`;
  for (const ref of refs) {
    await sql`insert into companion_task_reminders (user_id, task_ref, remind_at, time_zone)
      values (${a.id}, ${ref}, now() + interval '1 day', 'America/Vancouver')`;
  }
  const doneRev = (await taskOf(a, 'sanity:done-before')).revision;
  assertEquals((await apply(a, [setState('sanity:done-before', 'completed', doneRev)])).status, 200);
  await sql`update companion_task_reminders set status = 'sent' where user_id = ${a.id} and task_ref = 'sanity:sent-before'`;
  const history = Object.fromEntries((await reminders(a)).map(r => [r.task_ref, r]));
  assertEquals([history['sanity:done-before'].status, history['sanity:done-before'].cancelled_reason], ['cancelled', 'task_completed']);

  await sql`update companion_feature_gate set enabled = false`;
  const downStart = await dbNow();
  await migrate('down');
  const downEnd = await dbNow();
  // While rolled back, the archived rows already show every open reminder stopped.
  const archived = Object.fromEntries((await sql`select row_data from companion_rollback_archive
      where source = 'companion_task_reminders' and row_data->>'user_id' = ${a.id}`)
    .map(r => [r.row_data.task_ref, [r.row_data.status, r.row_data.cancelled_reason]]));
  assertEquals(archived['sanity:untouched'], ['cancelled', 'schema_rollback']);
  assertEquals(archived['sanity:reopened'], ['cancelled', 'schema_rollback']);
  assertEquals(archived['sanity:done-before'], ['cancelled', 'task_completed']);
  assertEquals(archived['sanity:sent-before'], ['sent', null]);
  // An old client completes and reopens a task while rolled back.
  await a.client.from('user_tasks').update({ completed: true, completed_at: iso() }).eq('sanity_checklist_id', 'reopened');
  await a.client.from('user_tasks').update({ completed: false, completed_at: null }).eq('sanity_checklist_id', 'reopened');
  await migrate('up');
  await openGate();

  const rows = Object.fromEntries((await reminders(a)).map(r => [r.task_ref, r]));
  for (const ref of ['sanity:untouched', 'sanity:reopened']) {
    assertEquals([rows[ref].status, rows[ref].cancelled_reason], ['cancelled', 'schema_rollback'], ref);
    const at = new Date(rows[ref].cancelled_at).getTime();
    assert(at >= downStart && at <= downEnd, `${ref} stopped at ${rows[ref].cancelled_at}, not during the rollback`);
  }
  assertEquals(rows['sanity:done-before'], history['sanity:done-before'], 'stopped history was rewritten');
  assertEquals(rows['sanity:sent-before'], history['sanity:sent-before'], 'a delivered reminder changed');
  const snapshot = await reminders(a);
  await roundTrip();
  assertEquals(await reminders(a), snapshot, 'a second rollback cycle changed reminder history');
}});

Deno.test({ name: 'account deletion removes receipts and proposals with the account', ...testOpts, fn: async () => {
  if (!(await migrationApplied())) await migrate('up');
  await openGate();
  const a = await newAccount('leaver');
  await sql`insert into user_tasks (user_id, sanity_checklist_id) values (${a.id}, 'x')`;
  const w = await apply(a, [setState('sanity:x', 'in_progress', 1)]);
  await apply(a, [setState('sanity:x', 'waiting', w.json.receipt.after_revision)]);
  assertEquals((await undo(a, w.json.operation_id)).status, 409);
  const del = await a.client.rpc('delete_user');
  assertEquals(del.error, null);
  const [r] = await sql`select (select count(*) from companion_action_receipts where user_id = ${a.id})::int receipts,
                               (select count(*) from companion_proposals where user_id = ${a.id})::int proposals`;
  assertEquals([r.receipts, r.proposals], [0, 0]);
}});

Deno.test({ name: 'cleanup', ...testOpts, fn: async () => { await sql.end(); } });
