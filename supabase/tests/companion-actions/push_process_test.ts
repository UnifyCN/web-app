// Real process termination and real Postgres connection close. No driver mock.
import { DB_URL,apply } from './support.ts';
import { recoverUnknown } from '../../workers/companion-push/worker.ts';
import { readyPush,sql,servers,policy,fresh,state,dispatch,config,modes,sends,hold,entered,release,until,assert,assertEquals } from './pushHarness.ts';
await readyPush();await policy();await sql`select cron.alter_job(jobid,schedule:='1 second') from cron.job where jobname='companion-reminder-due'`;
const fixtures=servers();const opts={sanitizeOps:false,sanitizeResources:false};
const path=new URL('../../workers/companion-push/process.ts',import.meta.url).pathname;
function start(id:string){
 return new Deno.Command(Deno.execPath(),{args:['run','--node-modules-dir=none','--lock='+new URL('../../workers/companion-push/deno.lock',import.meta.url).pathname,'--frozen','--allow-env','--allow-net','--allow-read',path,'dispatch',id],
 env:{COMPANION_PUSH_ENABLED:'true',COMPANION_PUSH_FIXTURE:'true',COMPANION_PUSH_DATABASE_URL:DB_URL,COMPANION_PUSH_FIXTURE_URL:'http://127.0.0.1:63615',SANITY_PROJECT_ID:'fixture369',COMPANION_PUSH_FIXTURE_CONTENT_URL:'http://127.0.0.1:63614/content'},stdout:'null',stderr:'piped'}).spawn();
}
Deno.test({name:'push process: kill after durable intent retains unknown identity without resend',...opts,fn:async()=>{
 console.log('FALSIFIER: killing the sender after intent loses the attempt or a restart sends it');
 const x=await fresh('kill-intent'),before=sends.length;
 let unlock!:()=>void,locked!:()=>void;
 const held=new Promise<void>(r=>unlock=r),ready=new Promise<void>(r=>locked=r);
 const lock=sql.begin(async tx=>{await tx`select public.companion_step_parent_lock(${x.a.id}::uuid,${x.t.ref})`;locked();await held;});await ready;
 const child=start(x.d.id);
 try{
  await until(()=>state(x.d.id),r=>r.state==='dispatching','durable intent before blocked parent');
  child.kill('SIGKILL');const result=await child.output();assertEquals(result.success,false);
 }finally{unlock();await lock;try{child.kill('SIGKILL');}catch{/* already exited */}}
 await recoverUnknown(sql);assertEquals((await state(x.d.id)).state,'unknown');
 await dispatch(sql,x.d.id,config);assertEquals(sends.length-before,0);
}});
Deno.test({name:'push process: forced database close is recovered in an independent connection',...opts,fn:async()=>{
 console.log('FALSIFIER: driver close prevents process exit/recovery or permits another provider request');
 const x=await fresh('force-close'),before=sends.length;hold();modes.set(x.op.token,'hold');const child=start(x.d.id),started=performance.now();
 try{
  await entered.promise;
  const closed=await sql`select pg_terminate_backend(pid) closed from pg_stat_activity where application_name like 'companion-push-369:%' and state='idle in transaction'`;
  assert(closed.some(r=>r.closed));
  const result=await Promise.race([child.output(),new Promise<never>((_,reject)=>setTimeout(()=>reject(Error('process did not recover')),4000))]);
  console.log(JSON.stringify({forced_close_exit:result.code,ms:performance.now()-started,stderr_bytes:result.stderr.length}));
  await recoverUnknown(sql);await dispatch(sql,x.d.id,config);assertEquals((await state(x.d.id)).state,'unknown');assertEquals(sends.length-before,1);
 }finally{release.resolve();try{child.kill('SIGKILL');}catch{/* exited */}}
}});
Deno.test({name:'push process: stopped sender loses database locks before the action lock limit',...opts,fn:async()=>{
 console.log('FALSIFIER: a stopped event loop retains locks for three seconds or its retained intent resends');
 const x=await fresh('stalled'),before=sends.length;hold();modes.set(x.op.token,'hold');const child=start(x.d.id);
 try{
  await entered.promise;Deno.kill(child.pid,'SIGSTOP');const start=performance.now();
  const cancelled=await apply(x.a,[{type:'reminder.cancel',task_ref:x.t.ref,expected_revision:x.rev,reminder_id:x.rid,expected_reminder_revision:1}],{authorization:{kind:'ui_control',removal_confirmed:true}});
  assertEquals(cancelled.status,200);assert(performance.now()-start<2800);
  console.log(JSON.stringify({stopped_process_cancel_ms:performance.now()-start}));
  child.kill('SIGKILL');await child.output();await recoverUnknown(sql);await dispatch(sql,x.d.id,config);
  assertEquals((await state(x.d.id)).state,'unknown');assertEquals(sends.length-before,1);
 }finally{release.resolve();try{child.kill('SIGKILL');}catch{/* exited */}}
}});
Deno.test({name:'push process: production supervisor kills a stopped child and a new cycle recovers it',...opts,fn:async()=>{
 console.log('FALSIFIER: supervisor cannot kill a stopped child or restart quarantines no durable intent');
 const {runIsolated}=await import('../../workers/companion-push/supervisor.ts');
 const x=await fresh('supervised-stall'),before=sends.length;hold();modes.set(x.op.token,'hold');
 const values:Record<string,string>={COMPANION_PUSH_ENABLED:'true',COMPANION_PUSH_FIXTURE:'true',COMPANION_PUSH_DATABASE_URL:DB_URL,COMPANION_PUSH_FIXTURE_URL:'http://127.0.0.1:63615'};
 const previous=new Map(Object.keys(values).map(k=>[k,Deno.env.get(k)]));
 for(const [k,v] of Object.entries(values))Deno.env.set(k,v);
 try{
  const start=performance.now(),running=runIsolated('dispatch',x.d.id);await entered.promise;
  const [backend]=await sql`select application_name from pg_stat_activity where application_name like 'companion-push-369:%' and state='idle in transaction'`;
  assert(backend);const pid=Number(String(backend.application_name).split(':')[1]);assert(pid>0);Deno.kill(pid,'SIGSTOP');
  const exit=await running;assert(exit!==0);assert(performance.now()-start<4500);
  await recoverUnknown(sql);assertEquals((await state(x.d.id)).state,'unknown');
  assertEquals(await runIsolated('dispatch',x.d.id),0);assertEquals(sends.length-before,1);
  console.log(JSON.stringify({supervisor_exit:exit,elapsed_ms:performance.now()-start}));
 }finally{release.resolve();for(const [k,v] of previous){if(v===undefined)Deno.env.delete(k);else Deno.env.set(k,v);}}
}});
Deno.test({name:'push process: cleanup',...opts,fn:()=>fixtures.shutdown()});
