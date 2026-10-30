import { assert, assertEquals } from 'jsr:@std/assert@1.0.19';
import { sql, newAccount, uuid } from './support.ts';
import { readyPush, localPolicy, enroll, enrollOp } from './pushSupport.ts';
import { until } from './pushHarness.ts';

await readyPush();
const opts = { sanitizeOps: false, sanitizeResources: false };

for (const stop of ['sign_out', 'gate_stop', 'expired_policy', 'banned_account']) {
  Deno.test({
    name: 'push authority: committed ' + stop + ' prevents enrollment after installation contention',
    ...opts,
    fn: async () => {
      console.log('FALSIFIER: authorization becomes invalid while enrollment waits, but a later write still commits: ' + stop);
      await localPolicy();
      const a = await newAccount('push369-authority-' + stop);
      const op = enrollOp();
      let release!: () => void;
      let entered!: () => void;
      let holder = 0;
      const held = new Promise<void>(r => release = r);
      const ready = new Promise<void>(r => entered = r);
      const holding = sql.begin(async tx => {
        const [row] = await tx`select pg_backend_pid() pid,pg_advisory_xact_lock(hashtextextended(${op.installation_id},369))`;
        holder = row.pid; entered(); await held;
      });
      await ready;
      let pending: ReturnType<typeof enroll> | undefined;
      try {
        pending = enroll(a, op);
        const graph = await until(() => sql`select pid,pg_blocking_pids(pid) blockers from pg_stat_activity where ${holder}::int=any(pg_blocking_pids(pid))`,
          rows => rows.length > 0, 'enrollment waits for installation', 1500);
        assertEquals((await sql`select count(*)::int n from companion_push_private.enrollments where installation_id=${op.installation_id}::uuid`)[0].n, 0);
        if (stop === 'sign_out') {
          assertEquals((await a.client.auth.signOut()).error, null);
          assertEquals((await sql`select count(*)::int n from auth.sessions where user_id=${a.id}::uuid`)[0].n, 0);
        } else if (stop === 'gate_stop') {
          await sql`update companion_push_private.settings set enrollment_enabled=false`;
          assertEquals((await sql`select enrollment_enabled from companion_push_private.settings`)[0].enrollment_enabled, false);
        } else if (stop === 'expired_policy') {
          await sql`update companion_push_private.settings set policy_valid_until=clock_timestamp()-interval '1 second'`;
          assertEquals((await sql`select policy_valid_until<clock_timestamp() expired from companion_push_private.settings`)[0].expired, true);
        } else {
          await sql`update auth.users set banned_until=clock_timestamp()+interval '1 day' where id=${a.id}::uuid`;
          assertEquals((await sql`select banned_until>clock_timestamp() banned from auth.users where id=${a.id}::uuid`)[0].banned, true);
        }
        console.log(JSON.stringify({ kind: 'enrollment_authority_intermediate', stop, graph, enrollments: 0, invalidation_committed: true }));
      } finally { release(); await holding; }
      const result = await pending!;
      const [rows] = await sql`select count(*)::int n from companion_push_private.enrollments where installation_id=${op.installation_id}::uuid`;
      console.log(JSON.stringify({ kind: 'enrollment_authority_result', stop, status: result.status, persisted_enrollments: rows.n }));
      if (stop === 'gate_stop') assertEquals(result.status, 503);
      else assert([401, 403].includes(result.status), 'invalid authorization must reject the waiting enrollment');
      assertEquals(rows.n, 0);
    },
  });
}

for (const stop of ['sign_out', 'gate_stop', 'banned_account']) {
  Deno.test({
    name: 'push authority: enrollment holds ' + stop + ' until its write commits',
    ...opts,
    fn: async () => {
      console.log('FALSIFIER: invalidation commits while enrollment is paused after its authorization check: ' + stop);
      await localPolicy();
      const a = await newAccount('push369-authority-first-' + stop);
      const op = enrollOp();
      await sql.unsafe(`create table companion_push_private.test_pause_token(token text primary key);
        create function companion_push_private.test_pause_token_write() returns trigger language plpgsql set search_path=public,pg_temp as $$ begin
        if exists(select 1 from companion_push_private.test_pause_token where token=new.token) then perform pg_advisory_xact_lock(369,901);end if;return new;end $$;
        create trigger push_test_pause before insert on public.push_tokens for each row execute function companion_push_private.test_pause_token_write();`);
      await sql`insert into companion_push_private.test_pause_token values(${op.token})`;
      let release!: () => void;
      let entered!: () => void;
      let holder = 0;
      const held = new Promise<void>(r => release = r);
      const ready = new Promise<void>(r => entered = r);
      const holding = sql.begin(async tx => {
        const [row] = await tx`select pg_backend_pid() pid,pg_advisory_xact_lock(369,901)`;
        holder = row.pid; entered(); await held;
      });
      await ready;
      let pending: ReturnType<typeof enroll> | undefined;
      let stopped: Promise<void> | undefined;
      let stopDone = false;
      let enrollmentPid = 0;
      try {
        pending = enroll(a, op); pending.catch(() => {});
        const graph = await until(() => sql`select pid,pg_blocking_pids(pid) blockers from pg_stat_activity where ${holder}::int=any(pg_blocking_pids(pid))`,
          rows => rows.length > 0, 'enrollment reaches token write', 1500);
        enrollmentPid = graph[0].pid;
        stopped = (async () => {
          if (stop === 'sign_out') assertEquals((await a.client.auth.signOut()).error, null);
          else if (stop === 'gate_stop') await sql`update companion_push_private.settings set enrollment_enabled=false`;
          else await sql`update auth.users set banned_until=clock_timestamp()+interval '1 day' where id=${a.id}::uuid`;
          stopDone = true;
        })();
        stopped.catch(() => {});
        const boundary = await until(async () => ({ done: stopDone, graph: await sql`select pid,pg_blocking_pids(pid) blockers from pg_stat_activity where ${enrollmentPid}::int=any(pg_blocking_pids(pid))` }),
          state => state.done || state.graph.length > 0, 'invalidation waits or commits', 1500);
        assertEquals(boundary.done, false, 'invalidation cannot commit before the enrolled write');
        assert(boundary.graph.length > 0, 'actual authorization row blocker is observed');
        assertEquals((await sql`select count(*)::int n from companion_push_private.enrollments where installation_id=${op.installation_id}::uuid`)[0].n, 0);
        console.log(JSON.stringify({ kind: 'enrollment_authority_first', stop, graph: boundary.graph, enrollments: 0, invalidation_committed: false }));
      } finally {
        release(); await holding;
        if (pending) await pending;
        if (stopped) await stopped;
        await sql.unsafe('drop trigger push_test_pause on public.push_tokens;drop function companion_push_private.test_pause_token_write();drop table companion_push_private.test_pause_token;');
      }
      assertEquals((await pending!).status, 200);
      assertEquals(stopDone, true);
      assertEquals((await sql`select count(*)::int n from companion_push_private.enrollments where installation_id=${op.installation_id}::uuid`)[0].n, 1);
    },
  });
}

for (const stage of ['operation_replay', 'token_lock']) {
  Deno.test({
    name: 'push authority: clock expiry is checked after ' + stage,
    ...opts,
    fn: async () => {
      console.log('FALSIFIER: a policy expires during a later lock wait, but a write or historical reply is returned: ' + stage);
      await localPolicy();
      const a = await newAccount('push369-late-expiry-' + stage);
      const op = enrollOp();
      const id = uuid();
      if (stage === 'operation_replay') assertEquals((await enroll(a, op, id)).status, 200);
      let release!: () => void;
      let entered!: () => void;
      let holder = 0;
      const held = new Promise<void>(r => release = r);
      const ready = new Promise<void>(r => entered = r);
      const holding = sql.begin(async tx => {
        const [row] = stage === 'operation_replay'
          ? await tx`select pg_backend_pid() pid,pg_advisory_xact_lock(public.companion_op_lock_key(${a.id}::uuid,${id}::uuid))`
          : await tx`select pg_backend_pid() pid,pg_advisory_xact_lock(hashtextextended(${op.token},369))`;
        holder = row.pid; entered(); await held;
      });
      await ready;
      await sql`update companion_push_private.settings set policy_valid_until=clock_timestamp()+interval '800 milliseconds'`;
      let pending: ReturnType<typeof enroll> | undefined;
      try {
        pending = enroll(a, op, id); pending.catch(() => {});
        const graph = await until(() => sql`select pid,pg_blocking_pids(pid) blockers from pg_stat_activity where ${holder}::int=any(pg_blocking_pids(pid))`,
          rows => rows.length > 0, 'enrollment reaches later lock', 1500);
        await until(() => sql`select clock_timestamp()>=policy_valid_until expired from companion_push_private.settings`,
          rows => rows[0].expired, 'verified policy deadline expires', 1500);
        console.log(JSON.stringify({ kind: 'enrollment_clock_expiry', stage, graph, policy_expired: true }));
      } finally { release(); await holding; }
      assertEquals((await pending!).status, 403);
      assertEquals((await sql`select count(*)::int n from companion_push_private.enrollments where installation_id=${op.installation_id}::uuid`)[0].n,
        stage === 'operation_replay' ? 1 : 0);
    },
  });
}
