import { assertEquals } from 'jsr:@std/assert@1.0.19';
import { newAccount, sql, call, uuid, sleep, status, migrate } from './support.ts';
import { readyPush, localPolicy, enroll, enrollOp, envelope, pushRead, PUSH_UP, PUSH_DOWN } from './pushSupport.ts';
await readyPush();await localPolicy();
const opts={sanitizeOps:false,sanitizeResources:false};
Deno.test({name:'push rollback: stops execution and preserves terminal history across reapply',...opts,fn:async()=>{
 console.log('FALSIFIER: rollback leaves enrollment enabled, removes history, or reapply restores execution');
 const a=await newAccount('push369-rollback'),op=enrollOp(),id=uuid();const saved=await enroll(a,op,id);
 assertEquals(saved.status,200,JSON.stringify(saved.json));
 // Before the rollback file exists, observe the unchanged live state as the red case.
 try{await sql.begin(async t=>t.unsafe(await Deno.readTextFile(PUSH_DOWN)));}
 catch(e){if(!(e instanceof Deno.errors.NotFound))throw e;}
 const [gate]=await sql`select enrollment_enabled,dispatch_enabled from companion_push_private.settings`;
 assertEquals(gate.enrollment_enabled,false);assertEquals(gate.dispatch_enabled,false);
 const [n]=await sql`select enabled,revoked_at from companion_push_private.enrollments where installation_id=${op.installation_id}::uuid`;
 assertEquals(n.enabled,false);assertEquals(!!n.revoked_at,true);
 await sql.begin(async t=>t.unsafe(await Deno.readTextFile(PUSH_UP)));
 await localPolicy();
 const replay=await status(a,id);assertEquals(replay.status,200);assertEquals(replay.json.status,'applied');
 const r=await pushRead(a,op);assertEquals(r.json.enrollment.revoked,true);
 assertEquals((await enroll(a,{...op,expected_revision:1})).status,403);
}});

Deno.test({name:'push rollback: full reverse order and reapply preserve stopped delivery identities',...opts,fn:async()=>{
 console.log('FALSIFIER: a retained push object blocks older rollback or reapply restarts an old attempt');
 const before=await sql`select id::text from companion_push_private.attempts order by id`;
 const events=await sql`select reminder_id::text from companion_push_private.events order by reminder_id`;
 await sql.begin(async t=>t.unsafe(await Deno.readTextFile(PUSH_DOWN)));
 await sql.begin(async t=>t.unsafe(await Deno.readTextFile(new URL('../../rollbacks/20261029175439_companion_task_reminders.down.sql',import.meta.url))));
 await migrate('down');await migrate('up');
 await sql.begin(async t=>t.unsafe(await Deno.readTextFile(new URL('../../migrations/20261029175439_companion_task_reminders.sql',import.meta.url))));
 await sql.begin(async t=>t.unsafe(await Deno.readTextFile(PUSH_UP)));
 assertEquals((await sql`select count(*)::int n from companion_push_private.deliveries where state in ('queued','retry_wait','dispatching')`)[0].n,0);
 assertEquals((await sql`select count(*)::int n from companion_task_reminders where status='pending'`)[0].n,0);
 assertEquals([...await sql`select id::text from companion_push_private.attempts order by id`],[...before]);
 assertEquals([...await sql`select reminder_id::text from companion_push_private.events order by reminder_id`],[...events]);
}});
Deno.test({name:'push actions: every request leaves generation quota tripwires untouched',...opts,fn:async()=>{
 console.log('FALSIFIER: a push action, status check, or target resolver calls an AI-generation quota function');
 assertEquals((await sql`select count(*)::int n from public.quota_tripwire_calls`)[0].n,0);
}});
