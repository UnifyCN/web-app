// Commands and suggestions that name a published (Sanity) Checklist task (mobile-app#365).
// The local edge runtime cannot reach published content, so this file runs the same
// request handler in this process, against the same local stack (real GoTrue JWTs,
// PostgREST, Postgres, row-level security), with a controlled content fixture in place of
// the content CDN. Everything else goes to the real stack. Each test names the
// observation that would prove the behavior wrong.
import { assertEquals } from 'jsr:@std/assert@1';
// The copy run.sh serves (the real source, or mutation_check.py's broken copy).
import { createHandler } from './supabase/functions/companion-actions/handler.ts';
import { createTaskLister } from './supabase/functions/companion-actions/targets.ts';
import {
  ANON_KEY, API_URL, admin, conversationWith, existingCustomTask, messageIn, newAccount, ready, setProfile, sql,
  testOpts,
} from './support.ts';

await ready();

// ------------------------------------------------------------------ content fixture
interface Doc { _id: string; title: string; province?: string; fr?: string }
const DOCS: Doc[] = [
  { _id: 'sin-number', title: 'Apply for a SIN', fr: 'Demander un NAS' },
  { _id: 'bank-account', title: 'Open a bank account', fr: 'Ouvrir un compte bancaire' },
  { _id: 'ohip-card', title: 'Apply for OHIP', province: 'Ontario' },
];
let contentDown = false;
const realFetch = globalThis.fetch;
globalThis.fetch = (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (!url.hostname.endsWith('.apicdn.sanity.io')) return realFetch(input, init);
  if (contentDown) return Promise.resolve(new Response('unavailable', { status: 503 }));
  const lang = JSON.parse(url.searchParams.get('$lang') ?? '"en"');
  const province = JSON.parse(url.searchParams.get('$province') ?? '""');
  const result = DOCS.filter(d => !d.province || d.province === province).map(d => ({
    _id: d._id, _rev: 'rev1', title: d.title, class: 1, province: d.province ?? null,
    i18n: lang === 'fr-CA' && d.fr ? { title: d.fr } : null,
  }));
  return Promise.resolve(new Response(JSON.stringify({ result }), { status: 200, headers: { 'content-type': 'application/json' } }));
};

const handle = createHandler({
  admin,
  listTasks: createTaskLister({ supabaseUrl: API_URL, anonKey: ANON_KEY, sanity: { projectId: 'fixture', dataset: 'production' } }),
  log: () => {},
});
type Account = Awaited<ReturnType<typeof newAccount>>;
async function call(who: Account, body: Record<string, unknown>) {
  const res = await handle(new Request('http://127.0.0.1/functions/v1/companion-actions', {
    method: 'POST',
    headers: { authorization: `Bearer ${who.jwt}`, 'content-type': 'application/json' },
    body: JSON.stringify({ contract_version: 1, client: { platform: 'ios', app_version: '9.9.9' }, ...body }),
  }));
  return { status: res.status, json: await res.json() };
}
const interpret = (who: Account, message_id: number) => call(who, { action: 'interpret', message_id });
const applyCommand = (who: Account, operation: unknown, message_id: number) =>
  call(who, { action: 'apply', operation_id: crypto.randomUUID(), operations: [operation], authorization: { kind: 'direct_command', message_id } });

async function newcomer(label: string) {
  const a = await newAccount(label);
  await setProfile(a, { persona: 'pr', stage: 1, province: 'British Columbia', city: 'Vancouver' });
  const { conversationRow } = await conversationWith(a, 'user', 'hello');
  return { a, conversationRow };
}
async function progress(who: Account, sanityId: string) {
  const [r] = await sql`select completed, progress_state, waiting_reason, revision, dismissed_at from user_tasks
    where user_id = ${who.id} and sanity_checklist_id = ${sanityId}`;
  return r ?? null;
}

Deno.test({
  name: 'a command names a published task by the title the Checklist shows, in the command\'s language, and changes only its state',
  ...testOpts,
  fn: async () => {
    // Wrong if: the published task is not found by its shown title (English or the
    // command's language), another task changes, or anything but this account's own
    // progress row is written.
    const { a, conversationRow } = await newcomer('ana');
    const m1 = await messageIn(a, conversationRow, 'user', 'Mark task "Apply for a SIN" as waiting: Appointment on Friday');
    const i1 = await interpret(a, m1);
    assertEquals(i1.json.command, {
      kind: 'edit',
      operation: { type: 'task.set_state', task_ref: 'sanity:sin-number', state: 'waiting', expected_revision: 0, waiting_reason: 'Appointment on Friday' },
      target: { task_ref: 'sanity:sin-number', title: 'Apply for a SIN' },
      before: { state: 'not_started', waiting_reason: null },
    });
    assertEquals(await progress(a, 'sin-number'), null, 'interpreting wrote');
    const r1 = await applyCommand(a, i1.json.command.operation, m1);
    assertEquals(r1.status, 200, JSON.stringify(r1.json));
    const p1 = await progress(a, 'sin-number');
    assertEquals([p1?.progress_state, p1?.waiting_reason, p1?.completed], ['waiting', 'Appointment on Friday', false]);

    const m2 = await messageIn(a, conversationRow, 'user', 'Marque la tâche « Ouvrir un compte bancaire » comme en cours');
    const i2 = await interpret(a, m2);
    assertEquals(i2.json.command.target, { task_ref: 'sanity:bank-account', title: 'Ouvrir un compte bancaire' });
    const r2 = await applyCommand(a, i2.json.command.operation, m2);
    assertEquals(r2.status, 200, JSON.stringify(r2.json));
    assertEquals((await progress(a, 'bank-account'))?.progress_state, 'in_progress');
    assertEquals((await progress(a, 'sin-number'))?.progress_state, 'waiting');
  },
});

Deno.test({
  name: 'a published task\'s shared title, description and priority are never edited for one account',
  ...testOpts,
  fn: async () => {
    // Wrong if: a rename, description or priority command for a published task resolves
    // to a write, or a forged edit under it is accepted.
    const { a, conversationRow } = await newcomer('bao');
    for (const text of [
      'Rename task "Apply for a SIN" to "My SIN"',
      'Set description of task "Apply for a SIN" to "Bring my passport"',
      'Set priority of task "Apply for a SIN" to Do now',
    ]) {
      const m = await messageIn(a, conversationRow, 'user', text);
      const i = await interpret(a, m);
      assertEquals([i.json.command.kind, i.json.command.reason], ['clarify', 'shared_task_field'], text);
      const forged = await applyCommand(a, { type: 'task.edit_details', task_ref: 'sanity:sin-number', expected_revision: 0, title: 'My SIN' }, m);
      assertEquals([forged.status, forged.json.reason], [422, 'shared_task_field']);
    }
    assertEquals(await progress(a, 'sin-number'), null);
  },
});

Deno.test({
  name: 'a published task and a custom task with the same title, another province\'s task or a removed one are not guessed',
  ...testOpts,
  fn: async () => {
    // Wrong if: one of two same-title tasks is picked, a task the Checklist does not show
    // (another province, removed) is a target.
    const { a, conversationRow } = await newcomer('cam');
    await existingCustomTask(a, 'Open a bank account');
    const same = await interpret(a, await messageIn(a, conversationRow, 'user', 'Mark task "Open a bank account" as completed'));
    assertEquals([same.json.command.reason, same.json.command.candidates.length], ['task_ambiguous', 2]);
    const other = await interpret(a, await messageIn(a, conversationRow, 'user', 'Mark task "Apply for OHIP" as completed'));
    assertEquals(other.json.command.reason, 'task_not_found');
    await a.client.from('user_tasks').upsert({ user_id: a.id, sanity_checklist_id: 'sin-number', dismissed_at: new Date().toISOString() },
      { onConflict: 'user_id,sanity_checklist_id' });
    const removed = await interpret(a, await messageIn(a, conversationRow, 'user', 'Mark task "Apply for a SIN" as completed'));
    assertEquals(removed.json.command.reason, 'task_not_found');
    assertEquals((await progress(a, 'sin-number'))?.completed, false);
  },
});

Deno.test({
  name: 'an edit draft for a published task is prepared only for a task the Checklist shows, and shows its title',
  ...testOpts,
  fn: async () => {
    // Wrong if: a draft is made for a published task this account's Checklist does not
    // show (a model could name any id), or the approved draft writes anything else.
    const { a } = await newcomer('dev');
    const p = await call(a, { action: 'prepare', operation: { type: 'task.set_state', task_ref: 'sanity:sin-number', state: 'in_progress' } });
    assertEquals(p.status, 200, JSON.stringify(p.json));
    assertEquals([p.json.proposal.context.task.title, p.json.proposal.context.task.state], ['Apply for a SIN', 'not_started']);
    const fr = await call(a, { action: 'prepare', language: 'fr-CA', operation: { type: 'task.set_state', task_ref: 'sanity:sin-number', state: 'completed' } });
    assertEquals(fr.json.proposal.context.task.title, 'Demander un NAS');
    for (const ref of ['sanity:ohip-card', 'sanity:not-a-task']) {
      const r = await call(a, { action: 'prepare', operation: { type: 'task.set_state', task_ref: ref, state: 'completed' } });
      assertEquals([r.status, r.json.reason], [404, 'task_not_found'], ref);
    }
    const proposal = p.json.proposal;
    const ok = await call(a, {
      action: 'apply', operation_id: crypto.randomUUID(), operations: proposal.operations,
      authorization: { kind: 'approved_proposal', proposal_id: proposal.proposal_id, proposal_revision: proposal.proposal_revision },
    });
    assertEquals(ok.status, 200, JSON.stringify(ok.json));
    assertEquals((await progress(a, 'sin-number'))?.progress_state, 'in_progress');
    assertEquals(await progress(a, 'ohip-card'), null);
  },
});

Deno.test({
  name: 'when published content cannot be read, no command or draft names a task',
  ...testOpts,
  fn: async () => {
    // Wrong if: with content unreadable, a command resolves among custom tasks alone (a
    // same-title published task may exist) or a draft is made.
    const { a, conversationRow } = await newcomer('eve');
    await existingCustomTask(a, 'Get a phone plan');
    contentDown = true;
    try {
      const i = await interpret(a, await messageIn(a, conversationRow, 'user', 'Mark task "Get a phone plan" as completed'));
      assertEquals([i.json.command.kind, i.json.command.reason], ['clarify', 'tasks_unavailable']);
      const p = await call(a, { action: 'prepare', operation: { type: 'task.set_state', task_ref: 'sanity:sin-number', state: 'completed' } });
      assertEquals([p.status, p.json.error], [503, 'tasks_unavailable']);
    } finally {
      contentDown = false;
    }
  },
});
