// Test support for the Companion task actions endpoint (mobile-app#361).
// Talks to the local stack started by run.sh only. Every behavioral assertion in
// the tests goes through the public HTTP boundary or the legacy client path
// (PostgREST with the user's JWT). Direct SQL is used for fixtures, lock holding,
// gate edits, migration up/down and row counts that no public path exposes.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import postgres from 'npm:postgres@3';

const env = (k: string) => {
  const v = Deno.env.get(`ACTIONS_${k}`);
  if (!v) throw new Error(`ACTIONS_${k} missing: run via ./run.sh`);
  return v;
};

export const API_URL = env('API_URL');
export const ANON_KEY = env('ANON_KEY');
export const SERVICE_ROLE_KEY = env('SERVICE_ROLE_KEY');
export const DB_URL = env('DB_URL');
if (!/^http:\/\/127\.0\.0\.1:/.test(API_URL) || !/@127\.0\.0\.1:/.test(DB_URL)) {
  throw new Error('refusing to run against a non-local stack');
}

// ACTIONS_MIGRATION_FILE / ACTIONS_ROLLBACK_FILE (#361) and ACTIONS_MIGRATION_363_FILE /
// ACTIONS_ROLLBACK_363_FILE (#363) substitute a deliberately broken copy (mutation_check.py).
const override = (k: string) => Deno.env.get(k) ? new URL(`file://${Deno.env.get(k)}`) : undefined;
export const MIGRATION = override('ACTIONS_MIGRATION_FILE') ??
  new URL('../../migrations/20261025235536_companion_task_actions.sql', import.meta.url);
export const ROLLBACK = override('ACTIONS_ROLLBACK_FILE') ??
  new URL('../../rollbacks/20261025235536_companion_task_actions.down.sql', import.meta.url);
export const MIGRATION_363 = override('ACTIONS_MIGRATION_363_FILE') ??
  new URL('../../migrations/20261026165156_companion_task_create.sql', import.meta.url);
export const ROLLBACK_363 = override('ACTIONS_ROLLBACK_363_FILE') ??
  new URL('../../rollbacks/20261026165156_companion_task_create.down.sql', import.meta.url);
// #366 task steps (ACTIONS_MIGRATION_366_FILE / ACTIONS_ROLLBACK_366_FILE for mutation runs).
export const MIGRATION_366 = override('ACTIONS_MIGRATION_366_FILE') ??
  new URL('../../migrations/20261027183644_companion_task_steps.sql', import.meta.url);
export const ROLLBACK_366 = override('ACTIONS_ROLLBACK_366_FILE') ??
  new URL('../../rollbacks/20261027183644_companion_task_steps.down.sql', import.meta.url);
// #365 task edits: ACTIONS_MIGRATION_365_FILE / ACTIONS_ROLLBACK_365_FILE likewise.
export const MIGRATION_365 = override('ACTIONS_MIGRATION_365_FILE') ??
  new URL('../../migrations/20261028001530_companion_task_edit.sql', import.meta.url);
export const ROLLBACK_365 = override('ACTIONS_ROLLBACK_365_FILE') ??
  new URL('../../rollbacks/20261028001530_companion_task_edit.down.sql', import.meta.url);

export const admin = createClient(API_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
export const sql = postgres(DB_URL, { max: 20, onnotice: () => {} });

export interface Account {
  id: string;
  email: string;
  jwt: string;
  client: SupabaseClient;
}

let counter = 0;
/** A synthetic account, created through the admin API and signed in with a password. */
export async function newAccount(label: string): Promise<Account> {
  const email = `${label}-${Date.now()}-${counter++}@actions361.invalid`;
  const password = 'actions-password-1';
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  const client = createClient(API_URL, ANON_KEY, { auth: { persistSession: false } });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session) throw signedIn.error;
  return { id: created.data.user.id, email, jwt: signedIn.data.session.access_token, client };
}

export interface Reply {
  status: number;
  json: any;
  headers: Headers;
}

/** The public request boundary: POST /functions/v1/companion-actions. */
export async function call(who: Account | null, body: unknown, bearer?: string): Promise<Reply> {
  const res = await fetch(`${API_URL}/functions/v1/companion-actions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: ANON_KEY,
      authorization: `Bearer ${bearer ?? (who ? who.jwt : ANON_KEY)}`,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = text;
  try {
    json = JSON.parse(text);
  } catch { /* keep text */ }
  return { status: res.status, json, headers: res.headers };
}

export const uuid = () => crypto.randomUUID();
export const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export async function migrationApplied(): Promise<boolean> {
  const [r] = await sql`select to_regclass('public.companion_action_receipts') is not null as applied`;
  return r.applied;
}

/**
 * The full schema change: 'up' applies the production migrations in timestamp order
 * (#361, #363, #366, #365), each in one transaction; 'down' runs the rollback scripts in
 * reverse order.
 */
export async function migrate(which: 'up' | 'down'): Promise<void> {
  if (which === 'up') {
    await sql.begin(async tx => await tx.unsafe(await Deno.readTextFile(MIGRATION)));
    await migrate363('up');
    await migrate366('up');
    await migrate365('up');
  } else {
    if (await migration365Applied()) await migrate365('down');
    if (await migration366Applied()) await migrate366('down');
    if (await migration363Applied()) await migrate363('down');
    await sql.begin(async tx => await tx.unsafe(await Deno.readTextFile(ROLLBACK)));
    await waitForSchemaCache('down');
  }
}

/**
 * Only the #363 migration or only its rollback script, in one transaction. The #365
 * rollback runs first when #365 is applied (it is the newest migration).
 */
export async function migrate363(which: 'up' | 'down'): Promise<void> {
  if (which === 'down' && await migration365Applied()) await migrate365('down');
  const text = await Deno.readTextFile(which === 'up' ? MIGRATION_363 : ROLLBACK_363);
  await sql.begin(async tx => await tx.unsafe(text));
  // Wait for what the file actually defines (a red run may use an empty placeholder).
  await waitForSchemaCache(which === 'up' && text.includes('companion_prepare_proposal') ? 'up' : 'up361');
}

/**
 * Only the #366 migration or only its rollback script, in one transaction. The #365
 * rollback runs first when #365 is applied (rollback order: #365, #366, #363, #361).
 */
export async function migrate366(which: 'up' | 'down'): Promise<void> {
  if (which === 'down' && await migration365Applied()) await migrate365('down');
  const text = await Deno.readTextFile(which === 'up' ? MIGRATION_366 : ROLLBACK_366);
  await sql.begin(async tx => await tx.unsafe(text));
  await waitForSchemaCache(which === 'up' && text.includes('companion_read_steps') ? 'up366' : 'up');
}

/** Only the #365 migration or only its rollback script, in one transaction. */
export async function migrate365(which: 'up' | 'down'): Promise<void> {
  const text = await Deno.readTextFile(which === 'up' ? MIGRATION_365 : ROLLBACK_365);
  await sql.begin(async tx => await tx.unsafe(text));
  // Wait for what the file actually defines (a red run may use an empty placeholder).
  const defines = text.includes('companion_prepare_edit');
  await waitForSchemaCache(which === 'up' ? (defines ? 'up365' : 'up366') : (defines ? 'up366' : 'up365'));
}

export async function migration365Applied(): Promise<boolean> {
  const [r] = await sql`select to_regprocedure('public.companion_prepare_edit(uuid,jsonb,jsonb,text)') is not null as applied`;
  return r.applied;
}

export async function migration366Applied(): Promise<boolean> {
  const [r] = await sql`select to_regprocedure('public.companion_read_steps(uuid)') is not null as applied`;
  return r.applied;
}

export async function migration363Applied(): Promise<boolean> {
  const [r] = await sql`select to_regprocedure('public.companion_prepare_proposal(uuid,jsonb,jsonb)') is not null as applied`;
  return r.applied;
}

/** PostgREST reloads its schema cache asynchronously after DDL; wait until it agrees. */
export async function waitForSchemaCache(which: 'up' | 'up361' | 'up366' | 'up365' | 'down', timeoutMs = 15000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${API_URL}/rest/v1/`, {
      headers: { apikey: SERVICE_ROLE_KEY, authorization: `Bearer ${SERVICE_ROLE_KEY}`, accept: 'application/openapi+json' },
    });
    const paths = Object.keys((await res.json()).paths ?? {});
    const seen = paths.includes('/companion_feature_gate') && paths.includes('/rpc/companion_apply_actions');
    const seen363 = paths.includes('/rpc/companion_prepare_proposal');
    const seen365 = paths.includes('/rpc/companion_prepare_edit');
    const seen366 = paths.includes('/rpc/companion_read_steps');
    if (which === 'up365' && seen && seen363 && seen366 && seen365) return;
    if (which === 'up' && seen && seen363 && !seen365) return;
    if (which === 'up366' && seen && seen363 && seen366 && !seen365) return;
    if (which === 'up361' && seen && !seen363) return;
    if (which === 'down' && !paths.some(p => p.includes('companion_') && !p.includes('rollback_archive'))) return;
    await sleep(100);
  }
  throw new Error(`PostgREST schema cache did not reflect '${which}' within ${timeoutMs}ms`);
}

/** Turns the feature on (the migration ships it off). */
export async function openGate(patch: Record<string, unknown> = {}): Promise<void> {
  await sql`update public.companion_feature_gate set enabled = true, min_contract_version = 1,
    max_contract_version = 1, allowed_platforms = '{ios,android,web}'`;
  if (Object.keys(patch).length) await sql`update public.companion_feature_gate set ${sql(patch)}`;
}

/** Brings the stack to "migration applied, feature on". */
export async function ready(): Promise<void> {
  if (!(await migrationApplied())) await migrate('up');
  else {
    if (!(await migration363Applied())) await migrate363('up');
    if (!(await migration366Applied())) await migrate366('up');
    if (!(await migration365Applied())) await migrate365('up');
  }
  await openGate();
}

export type Platform = 'ios' | 'android' | 'web';
const base = (platform: Platform = 'ios') => ({ contract_version: 1, client: { platform, app_version: '9.9.9' } });

export const read = (who: Account, platform?: Platform) => call(who, { ...base(platform), action: 'read' });
export const status = (who: Account, operation_id: string) =>
  call(who, { ...base(), action: 'status', operation_id });
export const apply = (
  who: Account | null,
  operations: unknown[],
  opts: { operation_id?: string; authorization?: unknown; platform?: Platform } = {},
) =>
  call(who, {
    ...base(opts.platform),
    action: 'apply',
    operation_id: opts.operation_id ?? uuid(),
    authorization: 'authorization' in opts ? opts.authorization : { kind: 'ui_control' },
    operations,
  });
export const undo = (
  who: Account,
  receipt_operation_id: string,
  opts: { operation_id?: string; authorization?: unknown; platform?: Platform } = {},
) =>
  call(who, {
    ...base(opts.platform),
    action: 'undo',
    operation_id: opts.operation_id ?? uuid(),
    receipt_operation_id,
    authorization: 'authorization' in opts ? opts.authorization : { kind: 'ui_control' },
  });

export const prepare = (who: Account | null, operation: unknown, extra: Record<string, unknown> = {}, platform?: Platform) =>
  call(who, { ...base(platform), action: 'prepare', operation, ...extra });
export const proposalOf = (who: Account, proposal_id: string) =>
  call(who, { ...base(), action: 'proposal', proposal_id });
export const revise = (who: Account, proposal_id: string, proposal_revision: number, operation: unknown) =>
  call(who, { ...base(), action: 'revise', proposal_id, proposal_revision, operation });
export const cancel = (who: Account, proposal_id: string, proposal_revision: number) =>
  call(who, { ...base(), action: 'cancel', proposal_id, proposal_revision });
export const interpret = (who: Account, message_id: unknown) =>
  call(who, { ...base(), action: 'interpret', message_id });
export const conversationActions = (who: Account, conversation_id: string) =>
  call(who, { ...base(), action: 'conversation_actions', conversation_id });

export const createTask = (title: string, priority = 'Do soon') => ({ type: 'task.create_custom', title, priority });

/** Approval evidence for a prepared proposal at the revision the user saw. */
export const approved = (p: { proposal_id: string; proposal_revision: number }) => ({
  kind: 'approved_proposal',
  proposal_id: p.proposal_id,
  proposal_revision: p.proposal_revision,
});

/** The caller's live custom tasks, as today's Checklist reads them (user JWT, RLS). */
export async function checklistTitles(who: Account): Promise<string[]> {
  const r = await who.client.from('custom_checklist_tasks').select('title').order('id');
  if (r.error) throw r.error;
  return (r.data ?? []).map(row => row.title as string);
}

/** A Companion conversation of `who` and one message in it, saved the way the clients do. */
export async function conversationWith(who: Account, role: 'user' | 'assistant', content: string) {
  const c = await who.client.from('conversations').insert({ user_id: who.id, title: 't' })
    .select('id, conversation_identifier').single();
  if (c.error) throw c.error;
  const message_id = await messageIn(who, c.data.id, role, content);
  return { conversation_id: c.data.conversation_identifier as string, conversationRow: c.data.id as number, message_id };
}

export async function messageIn(who: Account, conversationRow: number, role: 'user' | 'assistant', content: string): Promise<number> {
  const m = await who.client.from('messages').insert({ conversation_id: conversationRow, role, content })
    .select('id').single();
  if (m.error) throw m.error;
  return m.data.id as number;
}

/** The onboarding profile row, written the way the clients do (user JWT). */
export async function setProfile(who: Account, fields: Record<string, unknown>): Promise<void> {
  const r = await who.client.from('user_onboarding_profiles').upsert({ id: who.id, ...fields });
  if (r.error) throw r.error;
}

export const setState = (task_ref: string, state: string, expected_revision: number, waiting_reason?: string) => ({
  type: 'task.set_state',
  task_ref,
  state,
  expected_revision,
  ...(waiting_reason === undefined ? {} : { waiting_reason }),
});

export async function taskOf(who: Account, ref: string, platform?: Platform): Promise<any | undefined> {
  const r = await read(who, platform);
  if (r.status !== 200) throw new Error(`read failed: ${r.status} ${JSON.stringify(r.json)}`);
  return r.json.tasks.find((t: any) => t.task_ref === ref);
}

/** An existing custom task, created the way today's Checklist does (direct table insert). */
export async function existingCustomTask(who: Account, title = 'Get a phone plan'): Promise<{ ref: string; id: number }> {
  const r = await who.client.from('custom_checklist_tasks')
    .insert({ user_id: who.id, title, description: '', priority: 'Do soon' })
    .select('id').single();
  if (r.error) throw r.error;
  return { ref: `custom:${r.data.id}`, id: r.data.id };
}

/** An existing content-backed task row, written the way today's Checklist does. */
export async function existingSanityTask(who: Account, sanityId: string, completed = false): Promise<string> {
  const r = await who.client.from('user_tasks')
    .upsert({ user_id: who.id, sanity_checklist_id: sanityId, completed, completed_at: completed ? new Date().toISOString() : null },
      { onConflict: 'user_id,sanity_checklist_id' });
  if (r.error) throw r.error;
  return `sanity:${sanityId}`;
}

/** Waits until `n` other backends are blocked on a lock inside an action function. */
export async function waitForBlocked(n: number, pattern = '%companion_%', timeoutMs = 4000): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  let count = 0;
  while (Date.now() < deadline) {
    const [r] = await sql`select count(*)::int n from pg_stat_activity
      where pid <> pg_backend_pid() and wait_event_type = 'Lock' and query ilike ${pattern}`;
    count = r.n;
    if (count >= n) return count;
    await sleep(50);
  }
  return count;
}

/** Holds the operation lock of (user, operation) from a separate connection until release(). */
export function holdOperationLock(userId: string, operationId: string): { ready: Promise<void>; release: () => Promise<void> } {
  let release!: () => void;
  const held = new Promise<void>(r => (release = r));
  let markReady!: () => void;
  const readyP = new Promise<void>(r => (markReady = r));
  const tx = sql.begin(async t => {
    await t`select pg_advisory_xact_lock(public.companion_op_lock_key(${userId}::uuid, ${operationId}::uuid))`;
    markReady();
    await held;
  });
  return { ready: readyP, release: async () => { release(); await tx; } };
}

/** Holds a task row lock from a separate connection until release(). */
export function holdTaskRow(table: 'user_tasks' | 'custom_checklist_tasks', where: { column: string; value: string | number }) {
  let release!: () => void;
  const held = new Promise<void>(r => (release = r));
  let markReady!: () => void;
  const readyP = new Promise<void>(r => (markReady = r));
  const tx = sql.begin(async t => {
    await t`select 1 from ${t('public.' + table)} where ${t(where.column)} = ${String(where.value)} for update`;
    markReady();
    await held;
  });
  return { ready: readyP, release: async () => { release(); await tx; } };
}

export const testOpts = { sanitizeOps: false, sanitizeResources: false };

// ------------------------------------------------------------------ #366 task steps
export const stepCreate = (task_ref: string, titles: string[]) => ({ type: 'step.create', task_ref, titles });
export const stepUpdate = (step_id: string, title: string, expected_revision: number) =>
  ({ type: 'step.update', step_id, title, expected_revision });
export const stepDone = (step_id: string, done: boolean, expected_revision: number) =>
  ({ type: 'step.set_done', step_id, done, expected_revision });
export const stepRemove = (step_id: string, expected_revision: number) => ({ type: 'step.remove', step_id, expected_revision });
export const confirmedRemoval = { kind: 'ui_control', removal_confirmed: true };

/** The caller's live steps of one task, as the read action returns them, in order. */
export async function stepsOf(who: Account, ref: string, platform?: Platform): Promise<any[]> {
  const r = await read(who, platform);
  if (r.status !== 200) throw new Error(`read failed: ${r.status} ${JSON.stringify(r.json)}`);
  if (!Array.isArray(r.json.steps)) throw new Error(`read returned no steps: ${JSON.stringify(r.json)}`);
  return r.json.steps.filter((s: { task_ref: string }) => s.task_ref === ref);
}

/** Every step row of an account, removed ones included (no public path exposes those). */
export async function stepRows(userId: string): Promise<any[]> {
  return [...await sql`select id::text, task_ref, title, completed, removed_at is not null as removed, revision
    from companion_task_steps where user_id = ${userId} order by position, created_at`];
}

/**
 * Stand-in for the published Checklist content read of the action service. The edge
 * runtime asks it whether a content-backed task exists (run.sh points
 * COMPANION_CONTENT_QUERY_URL here). `published` lists the existing document ids; `fail`
 * makes it answer 503. Counts every request.
 */
export const contentStub = { published: new Set<string>(['sin-number', 'bank-account']), fail: false, requests: 0 };
let contentServer: Deno.HttpServer | null = null;
export function startContentStub(): void {
  if (contentServer) return;
  const port = Number(Deno.env.get('ACTIONS_CONTENT_PORT') ?? '60675');
  contentServer = Deno.serve({ hostname: '127.0.0.1', port, onListen: () => {} }, req => {
    contentStub.requests++;
    if (contentStub.fail) return new Response('unavailable', { status: 503 });
    const url = new URL(req.url);
    let id: unknown = null;
    try {
      id = JSON.parse(url.searchParams.get('$id') ?? 'null');
    } catch { /* not a JSON parameter */ }
    const found = typeof id === 'string' && contentStub.published.has(id) ? id : null;
    return Response.json({ result: found });
  });
}
