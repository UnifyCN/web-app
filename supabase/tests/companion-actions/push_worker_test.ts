import { call, apply, read, uuid, setState, prepare, confirmedApproval, taskRemove, undo, newAccount, sleep, holdParentLock } from './support.ts';
import { enroll, pushRequest, enrollOp } from './pushSupport.ts';
import { reconcile,recoverUnknown } from '../../workers/companion-push/worker.ts';
import { readyPush,sql,servers,policy,fresh,state,visible,resolve,dispatch,config,modes,sends,hold,entered,release,setContent,contentEntered,contentRelease,setReceipt,until,assert,assertEquals } from './pushHarness.ts';
await readyPush();await policy();
await sql`select cron.alter_job(jobid,schedule:='1 second') from cron.job where jobname='companion-reminder-due'`;
const fixtures=servers();
await sql.unsafe(`create table if not exists public.push369_test_barriers(reminder_id uuid primary key,key bigint not null);
 create or replace function public.push369_test_barrier() returns trigger language plpgsql as $$
 declare k bigint;begin select key into k from public.push369_test_barriers where reminder_id=new.id;
 if found and new.status='cancelled' then perform pg_advisory_xact_lock(k);end if;return new;end $$;
 drop trigger if exists push369_test_barrier on public.companion_task_reminders;
 create trigger push369_test_barrier after update on public.companion_task_reminders for each row execute function public.push369_test_barrier();`);
const opts={sanitizeOps:false,sanitizeResources:false};
const test=(name:string,falsifier:string,fn:()=>Promise<void>)=>Deno.test({name:'push worker: '+name,...opts,fn:async()=>{console.log('FALSIFIER: '+falsifier);await fn();}});
test('unknown transport and response parsing never resend','unknown outcome becomes retryable or changes in-app state',async()=>{
 const x=await fresh('unknown');modes.set(x.op.token,'lost');const before=sends.length;
 await dispatch(sql,x.d.id,config);await recoverUnknown(sql);await sql`update companion_push_private.deliveries set next_attempt_at=now() where id=${x.d.id}`;await sql`update companion_push_private.budget set blocked_until=now()`;await dispatch(sql,x.d.id,config);
 assertEquals(sends.length-before,1);assertEquals((await state(x.d.id)).state,'unknown');
 const v=await visible(x);assertEquals(v.reminder.status,'pending');assertEquals(v.task.state,'not_started');
 assertEquals(sends.at(-1)?.data,{type:'companion_reminder',delivery_id:x.d.id});
});
test('ticket, missing receipt, provider acceptance and display remain separate','receipt polling sends again or claims device display',async()=>{
 const x=await fresh('receipts'),before=sends.length;await dispatch(sql,x.d.id,config);
 assertEquals((await state(x.d.id)).state,'ticket_accepted');
 setReceipt('lost');await sql`update companion_push_private.deliveries set receipt_check_at=now() where id=${x.d.id}`;
 await reconcile(sql,x.d.id,config);assertEquals((await state(x.d.id)).state,'receipt_pending');
 setReceipt('ok');await sql`update companion_push_private.deliveries set receipt_check_at=now() where id=${x.d.id}`;
 await reconcile(sql,x.d.id,config);await dispatch(sql,x.d.id,config);
 assertEquals((await state(x.d.id)).state,'provider_accepted');assertEquals((await state(x.d.id)).device_display,'not_observed');assertEquals(sends.length-before,1);
});
for(const mode of ['reject','rate'])test('definite '+mode+' backoff and cap','definite rejection retries immediately or exceeds three attempts',async()=>{
 const x=await fresh(mode),before=sends.length;modes.set(x.op.token,mode);
 await dispatch(sql,x.d.id,config);await dispatch(sql,x.d.id,config);assertEquals(sends.length-before,1);
 for(let i=0;i<2;i++){await sql`update companion_push_private.budget set blocked_until=now()`;await sql`update companion_push_private.deliveries set next_attempt_at=now() where id=${x.d.id}`;await dispatch(sql,x.d.id,config);}
 await dispatch(sql,x.d.id,config);assertEquals(sends.length-before,3);assertEquals((await state(x.d.id)).state,'permanent_failure');
});
test('permanent error disables the original enrollment','invalid token still enables the same tuple',async()=>{
 const x=await fresh('permanent');modes.set(x.op.token,'invalid');await dispatch(sql,x.d.id,config);
 assertEquals((await state(x.d.id)).state,'permanent_failure');
 assertEquals((await sql`select enabled from companion_push_private.enrollments where installation_id=${x.op.installation_id}::uuid`)[0].enabled,false);
});
test('late receipt preserves a newer token generation','late DeviceNotRegistered disables a rotated token',async()=>{
 const x=await fresh('late');await dispatch(sql,x.d.id,config);
 const rotated={...x.op,expected_revision:1,token:enrollOp().token};assertEquals((await enroll(x.a,rotated)).status,200);
 setReceipt('invalid');await sql`update companion_push_private.deliveries set receipt_check_at=now() where id=${x.d.id}`;await reconcile(sql,x.d.id,config);
 assertEquals((await sql`select enabled from companion_push_private.enrollments where installation_id=${x.op.installation_id}::uuid`)[0].enabled,true);setReceipt('ok');
});
test('disabled installation stays suppressed after enablement','renewal creates delivery for an already consumed event',async()=>{
 const x=await fresh('suppressed',false,false),before=sends.length;
 assertEquals(x.d.state,'suppressed');assertEquals((await enroll(x.a,{...x.op,enabled:true,expected_revision:1})).status,200);
 const {enqueue}=await import('../../workers/companion-push/worker.ts');await enqueue(sql);await dispatch(sql,x.d.id,config);
 assertEquals(sends.length-before,0);assertEquals((await state(x.d.id)).state,'suppressed');
});
test('closed-app age does not create a foreground lease','90-day enrollment age alone prevents an authorized send',async()=>{
 const x=await fresh('closed');await sql`update companion_push_private.enrollments set registered_at=now()-interval '90 days' where installation_id=${x.op.installation_id}::uuid`;
 const before=sends.length;await dispatch(sql,x.d.id,config);assertEquals(sends.length-before,1);
});
for(const kind of ['session','permission','generation','credential','policy'])test('final '+kind+' authorization','revoked eligibility still crosses the provider boundary',async()=>{
 const x=await fresh('final-'+kind),before=sends.length;
 if(kind==='session')await x.a.client.auth.signOut();
 if(kind==='permission')assertEquals((await call(x.a,pushRequest({type:'push.disable',installation_id:x.op.installation_id,installation_secret:x.op.installation_secret,expected_revision:1}))).status,200);
 if(kind==='generation')assertEquals((await enroll(x.a,{...x.op,expected_revision:1})).status,200);
 if(kind==='credential')assertEquals((await call(x.a,pushRequest({type:'push.revoke',installation_id:x.op.installation_id,installation_secret:x.op.installation_secret,expected_revision:1}))).status,200);
 if(kind==='policy')await sql`update companion_push_private.settings set policy_verified_at=null`;
 await dispatch(sql,x.d.id,config);assertEquals(sends.length-before,0);
});
test('provider budget fails closed and includes reserved existing senders','missing aggregate verification or exhausted shared capacity permits a send',async()=>{
 const x=await fresh('budget'),before=sends.length;
 await sql`update companion_push_private.settings set aggregate_verified_at=null`;await dispatch(sql,x.d.id,config);assertEquals((await state(x.d.id)).attempt_count,0);
 await policy();await sql`update companion_push_private.settings set provider_project_per_second=500,other_senders_reserved_per_second=500`;await dispatch(sql,x.d.id,config);assertEquals(sends.length-before,0);
});
test('owned current task resolver rejects another account and removed task','a shared task identifier authorizes another account',async()=>{
 const x=await fresh('resolver'),other=await newAccount('push369-resolver-other');
 assertEquals((await resolve(other,x.d.id)).json,{target:'unavailable'});
 assertEquals((await resolve(x.a,x.d.id)).json,{target:'available',task_ref:x.t.ref});
 const p=await prepare(x.a,taskRemove(x.t.ref,x.rev));assertEquals(p.status,200);
 const removed=await apply(x.a,p.json.proposal.operations,{authorization:confirmedApproval(p.json.proposal)});assertEquals(removed.status,200);
 assertEquals((await resolve(x.a,x.d.id)).json,{target:'unavailable'});
 assertEquals((await call(null,{contract_version:1,client:{platform:'ios',app_version:'9'},action:'push_resolve',delivery_id:x.d.id,language:'en'})).status,401);
});
for(const order of ['action-first','worker-first'])for(const kind of ['complete','remove','cancel','legacy','content-complete'])test(kind+' '+order,'a committed earlier stop sends, or an overlapping stop does not wait on the accepted task boundary',async()=>{
 const x=await fresh('race-'+kind,kind==='content-complete'),before=sends.length;
 const stop=async()=>{
  if(kind==='cancel')return apply(x.a,[{type:'reminder.cancel',task_ref:x.t.ref,expected_revision:x.rev,reminder_id:x.rid,expected_reminder_revision:1}],{authorization:{kind:'ui_control',removal_confirmed:true}});
  if(kind==='remove'){const p=await prepare(x.a,taskRemove(x.t.ref,x.rev));assertEquals(p.status,200);return apply(x.a,p.json.proposal.operations,{authorization:confirmedApproval(p.json.proposal)});}
  if(kind==='legacy'||kind==='content-complete'){
   const r=kind==='legacy'?await x.a.client.from('custom_checklist_tasks').update({completed:true}).eq('id',x.t.id):await x.a.client.from('user_tasks').insert({user_id:x.a.id,sanity_checklist_id:'sin-number',completed:true});
   assertEquals(r.error,null);return {status:200,json:{}};
  }
  return apply(x.a,[setState(x.t.ref,'completed',x.rev)]);
 };
 if(order==='action-first'){
  const key=369001;await sql`insert into public.push369_test_barriers values(${x.rid}::uuid,${key})`;
  let unlock!:()=>void,mark!:()=>void;const held=new Promise<void>(r=>unlock=r),ready=new Promise<void>(r=>mark=r);
  const barrier=sql.begin(async tx=>{await tx`select pg_advisory_xact_lock(${key}::bigint)`;mark();await held;});await ready;
  let stopping:ReturnType<typeof stop>|undefined,sending:Promise<void>|undefined;
  try{
   stopping=stop();await until(()=>sql`select pid,pg_blocking_pids(pid) blockers from pg_stat_activity where wait_event_type='Lock'`,r=>r.some(v=>v.blockers.length>0),'writer owns parent and waits on fixture barrier');
   sending=dispatch(sql,x.d.id,config);
   const graph=await until(()=>sql`select pid,pg_blocking_pids(pid) blockers from pg_stat_activity where wait_event_type='Lock'`,r=>r.filter(v=>v.blockers.length>0).length>=2,'worker waits behind writer');
   const mid=await visible(x);assertEquals(mid.reminder.status,'pending');
   console.log(JSON.stringify({race:kind,order,intermediate:mid.reminder.status,graph}));
  }finally{unlock();await barrier;}
  assertEquals((await stopping!).status,200);await sending;
  assertEquals((await visible(x)).reminder.status,'cancelled');assertEquals(sends.length-before,0);
  await sql`delete from public.push369_test_barriers where reminder_id=${x.rid}::uuid`;
 }else{
  hold();modes.set(x.op.token,'hold');const sending=dispatch(sql,x.d.id,config);await entered.promise;
  const stopping=stop();const graph=await until(()=>sql`select pid,pg_blocking_pids(pid) blockers from pg_stat_activity where wait_event_type='Lock'`,r=>r.some(v=>v.blockers.length>0),'stop blocked behind provider');
  const mid=await visible(x);assertEquals(mid.reminder.status,'pending');
  release.resolve();await sending;assertEquals((await stopping).status,200);assertEquals((await visible(x)).reminder.status,'cancelled');assertEquals(sends.length-before,1);
  console.log(JSON.stringify({race:kind,order,intermediate:mid.reminder.status,graph,provider_calls:1}));
 }
});
for(const mode of ['headers','body'])test('content '+mode+' total deadline','slow content retains the public task lock beyond 2.8 seconds or sends after expiry',async()=>{
 const x=await fresh('slow-content-'+mode,true),before=sends.length;setContent(mode);
 const start=performance.now(),sending=dispatch(sql,x.d.id,config);await contentEntered.promise;
 const cancel=apply(x.a,[{type:'reminder.cancel',task_ref:x.t.ref,expected_revision:x.rev,reminder_id:x.rid,expected_reminder_revision:1}],{authorization:{kind:'ui_control',removal_confirmed:true}});
 const graph=await until(()=>sql`select pid,pg_blocking_pids(pid) blockers from pg_stat_activity where wait_event_type='Lock'`,r=>r.some(v=>v.blockers.length>0),'deadline public wait');
 const mid=await visible(x);assertEquals(mid.reminder.status,'pending');
 let cancellationStatus:number|null=null;
 try{const cancelled=await cancel;cancellationStatus=cancelled.status;assertEquals(cancelled.status,200);assert(performance.now()-start<2800);await sending;assertEquals(sends.length-before,0);assertEquals((await state(x.d.id)).state,'unknown');}
 finally{console.log(JSON.stringify({deadline:'content-'+mode,ms:performance.now()-start,http_status:cancellationStatus,public_reminder_rows:Number(!!mid.reminder),graph}));contentRelease.resolve();setContent('ok');}
});
for(const mode of ['hold','body'])test('provider '+mode+' total deadline','slow provider holds cancellation beyond 2.8 seconds or permits resend',async()=>{
 const x=await fresh('slow-provider-'+mode),before=sends.length;hold();modes.set(x.op.token,mode);
 const start=performance.now(),sending=dispatch(sql,x.d.id,config);await entered.promise;
 const cancel=apply(x.a,[{type:'reminder.cancel',task_ref:x.t.ref,expected_revision:x.rev,reminder_id:x.rid,expected_reminder_revision:1}],{authorization:{kind:'ui_control',removal_confirmed:true}});
 const graph=await until(()=>sql`select pid,pg_blocking_pids(pid) blockers from pg_stat_activity where wait_event_type='Lock'`,r=>r.some(v=>v.blockers.length>0),'provider public wait');
 const mid=await visible(x);assertEquals(mid.reminder.status,'pending');
 let cancellationStatus:number|null=null;
 try{const cancelled=await cancel;cancellationStatus=cancelled.status;assertEquals(cancelled.status,200);assert(performance.now()-start<2800);await sending;await dispatch(sql,x.d.id,config);assertEquals(sends.length-before,1);assertEquals((await state(x.d.id)).state,'unknown');}
 finally{console.log(JSON.stringify({deadline:'provider-'+mode,ms:performance.now()-start,http_status:cancellationStatus,public_reminder_rows:Number(!!mid.reminder),graph}));release.resolve();}
});
for(const kind of ['renew','disable','revoke'])test('enrollment '+kind+' waits behind dispatch','an enrollment update ignores the locked generation or a late receipt disables a new generation',async()=>{
 const x=await fresh('enrollment-race-'+kind),before=sends.length;hold();modes.set(x.op.token,'hold');
 const sending=dispatch(sql,x.d.id,config);await entered.promise;
 const changing=kind==='renew'?enroll(x.a,{...x.op,expected_revision:1}):call(x.a,pushRequest({type:'push.'+kind,installation_id:x.op.installation_id,installation_secret:x.op.installation_secret,expected_revision:1}));
 const graph=await until(()=>sql`select pid,pg_blocking_pids(pid) blockers from pg_stat_activity where wait_event_type='Lock'`,r=>r.some(v=>v.blockers.length>0),'enrollment waits on sender');
 const {pushRead}=await import('./pushSupport.ts');assertEquals((await pushRead(x.a,x.op)).json.enrollment.revision,1);
 release.resolve();await sending;assertEquals((await changing).status,200);assertEquals(sends.length-before,1);
 console.log(JSON.stringify({enrollment_race:kind,intermediate_revision:1,graph}));
});
test('receipt expiry never returns a sendable identity','an expired receipt resets an attempt or permits resend',async()=>{
 const x=await fresh('expiry'),before=sends.length;await dispatch(sql,x.d.id,config);
 await sql`update companion_push_private.deliveries set ticket_at=now()-interval '25 hours',receipt_check_at=now() where id=${x.d.id}`;
 await reconcile(sql,x.d.id,config);await dispatch(sql,x.d.id,config);assertEquals((await state(x.d.id)).state,'receipt_expired');assertEquals(sends.length-before,1);
});
test('final write timeout releases cancellation and keeps unknown intent','a blocked final write exceeds the action lock budget or enables resend',async()=>{
 const x=await fresh('final-write'),before=sends.length;
 await sql.unsafe(`create or replace function public.push369_final_write_delay() returns trigger language plpgsql as $$begin
 if new.id='${x.d.id}'::uuid and new.state='ticket_accepted' then perform pg_sleep(5);end if;return new;end $$;
 create trigger push369_final_write_delay before update on companion_push_private.deliveries for each row execute function public.push369_final_write_delay();`);
 const start=performance.now(),sending=dispatch(sql,x.d.id,config);
 try{
  await until(()=>sql`select pid from pg_stat_activity where wait_event='PgSleep' and state='active'`,r=>r.length>0,'final write delay');
  const stopping=apply(x.a,[{type:'reminder.cancel',task_ref:x.t.ref,expected_revision:x.rev,reminder_id:x.rid,expected_reminder_revision:1}],{authorization:{kind:'ui_control',removal_confirmed:true}});
  const graph=await until(()=>sql`select pid,pg_blocking_pids(pid) blockers from pg_stat_activity where wait_event_type='Lock'`,r=>r.some(v=>v.blockers.length>0),'final-write public wait');
  assertEquals((await visible(x)).reminder.status,'pending');
  const stopped=await stopping;assertEquals(stopped.status,200);await sending;assert(performance.now()-start<2800);
  await dispatch(sql,x.d.id,config);assertEquals((await state(x.d.id)).state,'unknown');assertEquals(sends.length-before,1);
  console.log(JSON.stringify({deadline:'final-write',ms:performance.now()-start,http_status:stopped.status,public_reminder_rows:Number(!!(await visible(x)).reminder),graph}));
 }finally{await sending;await sql.unsafe('drop trigger push369_final_write_delay on companion_push_private.deliveries;drop function public.push369_final_write_delay();');}
});
Deno.test({name:'push worker: fixture cleanup',...opts,fn:async()=>{await fixtures.shutdown();await sql.unsafe('drop trigger push369_test_barrier on public.companion_task_reminders;drop function public.push369_test_barrier();drop table public.push369_test_barriers;');}});
