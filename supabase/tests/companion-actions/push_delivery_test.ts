import { assertEquals } from 'jsr:@std/assert@1.0.19';
import { newAccount, existingCustomTask, taskOf, apply, read, sql, sleep } from './support.ts';
import { readyPush, localPolicy } from './pushSupport.ts';
import { enqueue } from '../../workers/companion-push/worker.ts';
await readyPush();
await localPolicy();
const opts={sanitizeOps:false,sanitizeResources:false};
const a=await newAccount('push369-delivery');
Deno.test({name:'push delivery: disabled dispatch consumes due history without changing the in-app reminder',...opts,fn:async()=>{
 await sql`update companion_push_private.settings set dispatch_enabled=false`;
 console.log('FALSIFIER: a disabled due event is not durably suppressed, or task/reminder state changes');
 const t=await existingCustomTask(a),rev=(await taskOf(a,t.ref)).revision;
 const instant=new Date(Date.now()+1100).toISOString();
 const r=await apply(a,[{type:'reminder.schedule',task_ref:t.ref,expected_revision:rev,remind_at:instant,time_zone:'Etc/UTC',wall_time:instant.slice(0,-1)}]);
 assertEquals(r.status,200,JSON.stringify(r.json));
 const rid=r.json.results[0].reminder_id;
 await sql`select cron.alter_job(jobid,schedule:='1 second') from cron.job where jobname='companion-reminder-due'`;
 for(let i=0;i<100;i++) {if((await sql`select count(*)::int n from companion_reminder_private.events where reminder_id=${rid}::uuid`)[0].n)break;await sleep(50);}
 await enqueue(sql);
 assertEquals((await sql`select reason from companion_push_private.events where reminder_id=${rid}::uuid`)[0]?.reason,'dispatch_disabled');
 const visible=await read(a);
 assertEquals(visible.json.reminders.items.find((v:{reminder_id:string})=>v.reminder_id===rid).status,'pending');
 assertEquals((await taskOf(a,t.ref)).state,'not_started');
}});
Deno.test({name:'push delivery: enabled competing workers commit one intent and one provider request',...opts,fn:async()=>{
 console.log('FALSIFIER: two sends, no durable intent before I/O, or ticket claims device display');
 await sql`update companion_push_private.settings set dispatch_enabled=true,dispatch_not_before=now()-interval '1 hour',companion_per_minute=10,
   provider_project_per_second=600,other_senders_reserved_per_second=590,aggregate_verified_at=now(),aggregate_valid_until=now()+interval '1 hour',receipt_per_minute=10`;
 const { enroll, enrollOp }=await import('./pushSupport.ts');
 const op=enrollOp();const enrolled=await enroll(a,op);assertEquals(enrolled.status,200,JSON.stringify(enrolled.json));
 const t=await existingCustomTask(a),rev=(await taskOf(a,t.ref)).revision;
 const instant=new Date(Date.now()+1100).toISOString();
 const saved=await apply(a,[{type:'reminder.schedule',task_ref:t.ref,expected_revision:rev,remind_at:instant,time_zone:'Etc/UTC',wall_time:instant.slice(0,-1)}]);
 assertEquals(saved.status,200,JSON.stringify(saved.json));const rid=saved.json.results[0].reminder_id;
 for(let i=0;i<100;i++){if((await sql`select count(*)::int n from companion_reminder_private.events where reminder_id=${rid}::uuid`)[0].n)break;await sleep(50);}
 await Promise.all([enqueue(sql),enqueue(sql)]);
 const rows=await sql`select * from companion_push_private.deliveries where reminder_id=${rid}::uuid`;
 assertEquals(rows.length,1);assertEquals(rows[0].state,'queued');
 const { dispatch }=await import('../../workers/companion-push/worker.ts');
 let sends=0;
 const server=Deno.serve({hostname:'127.0.0.1',port:63615,onListen:()=>{}},async req=>{
   const b=await req.json();sends++;
   assertEquals(b.to,op.token);
   assertEquals((await sql`select count(*)::int n from companion_push_private.attempts where delivery_id=${rows[0].id}::uuid`)[0].n,1);
   return Response.json({data:{status:'ok',id:'synthetic-ticket-369'}});
 });
 try {
  await Promise.all([dispatch(sql,String(rows[0].id),{fixture:true,providerURL:'http://127.0.0.1:63615'}),dispatch(sql,String(rows[0].id),{fixture:true,providerURL:'http://127.0.0.1:63615'})]);
  assertEquals(sends,1);
  const [after]=await sql`select state,device_display from companion_push_private.deliveries where id=${rows[0].id}::uuid`;
  assertEquals(after.state,'ticket_accepted');assertEquals(after.device_display,'not_observed');
 } finally {console.log(JSON.stringify({kind:'provider_fixture_distribution',total:sends,modes:{ok:sends}}));await server.shutdown();}
}});
