import { assertEquals } from 'jsr:@std/assert@1.0.19';
import { sql, newAccount, existingCustomTask, taskOf, apply } from './support.ts';
import { readyPush, enroll, enrollOp } from './pushSupport.ts';
import { enqueue } from '../../workers/companion-push/worker.ts';
import { policy, until } from './pushHarness.ts';

await readyPush();
await policy();
await sql`select cron.alter_job(jobid,schedule:='1 second') from cron.job where jobname='companion-reminder-due'`;

Deno.test({
  name: 'push isolation: a deleted shared token cannot stop another account or restart an old event',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    console.log('FALSIFIER: deleting one shared token aborts the batch, skips a healthy account, or later enrollment revives the consumed event');
    const a = await newAccount('push369-deleted-token');
    const b = await newAccount('push369-healthy-token');
    const first = enrollOp();
    const healthy = enrollOp();
    assertEquals((await enroll(a, first)).status, 200);
    assertEquals((await enroll(b, healthy)).status, 200);
    const removed = await a.client.from('push_tokens').delete().eq('token', first.token).select('id');
    assertEquals(removed.error, null);
    assertEquals(removed.status, 200);
    assertEquals(removed.data?.length, 1);
    assertEquals((await sql`select token_id from companion_push_private.enrollments where installation_id=${first.installation_id}::uuid`)[0].token_id, null);
    const reminders: string[] = [];
    for (const who of [a, b]) {
      const task = await existingCustomTask(who);
      const revision = (await taskOf(who, task.ref)).revision;
      const instant = new Date(Date.now() + 1100).toISOString();
      const saved = await apply(who, [{ type: 'reminder.schedule', task_ref: task.ref, expected_revision: revision,
        remind_at: instant, time_zone: 'Etc/UTC', wall_time: instant.slice(0, -1) }]);
      assertEquals(saved.status, 200);
      reminders.push(saved.json.results[0].reminder_id);
    }
    await until(() => sql`select count(*)::int n from companion_reminder_private.events where reminder_id=any(${reminders}::uuid[])`,
      rows => rows[0].n === 2, 'both committed due events');
    let error: string | null = null;
    try { await enqueue(sql); } catch (e) { error = String((e as { code?: string }).code ?? e); }
    const [consumed] = await sql`select count(*)::int n from companion_push_private.events where reminder_id=any(${reminders}::uuid[])`;
    const [queued] = await sql`select count(*)::int n from companion_push_private.deliveries where reminder_id=${reminders[1]}::uuid and state='queued'`;
    console.log(JSON.stringify({ kind: 'deleted_token_isolation', jwt_delete_status: removed.status, deleted_rows: removed.data?.length,
      sqlstate: error, consumed_events: consumed.n, healthy_queued: queued.n }));
    assertEquals(error, null, 'a missing token must not abort other accounts');
    assertEquals(consumed.n, 2);
    assertEquals(queued.n, 1);
    assertEquals((await sql`select reason from companion_push_private.events where reminder_id=${reminders[0]}::uuid`)[0].reason, 'no_eligible_installation');
    assertEquals((await enroll(a, { ...first, expected_revision: 1 })).status, 200);
    await enqueue(sql);
    assertEquals((await sql`select count(*)::int n from companion_push_private.deliveries where reminder_id=${reminders[0]}::uuid`)[0].n, 0,
      'a replacement token cannot restart the earlier consumed event');
  },
});
