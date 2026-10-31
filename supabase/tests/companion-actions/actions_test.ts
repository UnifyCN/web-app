// Companion task actions (mobile-app#361): the public request boundary against a
// real local Postgres + GoTrue + PostgREST + edge runtime. Each test names the
// observation that would prove the behavior wrong.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import {
  apply, existingCustomTask, existingSanityTask, newAccount, read, ready, setState, sql, taskOf, testOpts,
} from './support.ts';

await ready();

Deno.test({
  name: 'an existing task is set to Waiting with a reason; the receipt names the exact change; another platform reads it',
  ...testOpts,
  fn: async () => {
    // Wrong if: the write lands on another row, the receipt reports a state that was not
    // saved, or a second platform reads a different state or reason.
    const a = await newAccount('alice');
    const ref = await existingSanityTask(a, 'sin-number');
    const before = await taskOf(a, ref);
    assertEquals([before.state, before.waiting_reason], ['not_started', null]);

    const w = await apply(a, [setState(ref, 'waiting', before.revision, '  Letter from Service Canada  ')]);
    assertEquals(w.status, 200, JSON.stringify(w.json));
    assertEquals(w.json.status, 'applied');
    assertEquals(w.json.replayed, false);
    assertEquals(w.json.receipt.kind, 'change');
    assertEquals(w.json.receipt.task_ref, ref);
    assertEquals([w.json.receipt.before_state, w.json.receipt.after_state], ['not_started', 'waiting']);
    assertEquals(w.json.receipt.before_revision, before.revision);
    assertEquals(w.json.receipt.current, true);
    assertEquals(w.json.receipt.undoable, true);

    const web = await taskOf(a, ref, 'web');
    assertEquals([web.state, web.waiting_reason], ['waiting', 'Letter from Service Canada']);
    assertEquals(web.revision, w.json.receipt.after_revision);
    assertEquals(web.last_receipt.operation_id, w.json.operation_id);

    // The legacy Checklist read sees an unfinished task.
    const legacy = await a.client.from('user_tasks').select('completed').eq('sanity_checklist_id', 'sin-number').single();
    assertEquals(legacy.data?.completed, false);
  },
});

Deno.test({
  name: 'all four states round-trip on an existing custom task, and Completed is what the legacy Checklist reads',
  ...testOpts,
  fn: async () => {
    const a = await newAccount('alice');
    const { ref, id } = await existingCustomTask(a);
    let rev = (await taskOf(a, ref)).revision;
    for (const state of ['in_progress', 'waiting', 'completed', 'not_started', 'completed']) {
      const w = await apply(a, [setState(ref, state, rev)]);
      assertEquals(w.status, 200, `${state}: ${JSON.stringify(w.json)}`);
      const t = await taskOf(a, ref);
      assertEquals(t.state, state);
      rev = t.revision;
    }
    const legacy = await a.client.from('custom_checklist_tasks').select('completed,title').eq('id', id).single();
    assertEquals([legacy.data?.completed, legacy.data?.title], [true, 'Get a phone plan']);
    const [{ n }] = await sql`select count(*)::int n from companion_action_receipts where user_id = ${a.id}`;
    assertEquals(n, 5);
  },
});

Deno.test({ name: 'read returns only the caller\'s tasks', ...testOpts, fn: async () => {
  const a = await newAccount('alice');
  const b = await newAccount('bob');
  await existingCustomTask(a, 'Alice private');
  await existingSanityTask(a, 'bank-account');
  const rb = await read(b);
  assertEquals([rb.status, rb.json.tasks], [200, []]);
  const ra = await read(a);
  assert(ra.json.tasks.length === 2);
}});

Deno.test({ name: 'cleanup', ...testOpts, fn: async () => { await sql.end(); } });
