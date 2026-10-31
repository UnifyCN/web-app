import { sleep } from './support.ts';
import { readyPush,sql,servers,policy,fresh,state,dispatch,config,sends,setContent,contentEntered,contentRelease,assertEquals } from './pushHarness.ts';
await readyPush();await policy();await sql`select cron.alter_job(jobid,schedule:='1 second') from cron.job where jobname='companion-reminder-due'`;
const opts={sanitizeOps:false,sanitizeResources:false};
Deno.test({name:'push expiry: session expiry during content I/O is checked at the last preventable POST boundary',...opts,fn:async()=>{
 console.log('FALSIFIER: content delay lets a session expire before POST but the worker still sends');
 const fixture=servers();setContent('ok');const x=await fresh('expires-during-content',true),before=sends.length;
 await sql`update auth.sessions set not_after=clock_timestamp()+interval '800 milliseconds' where user_id=${x.a.id}::uuid`;
 setContent('headers');const sending=dispatch(sql,x.d.id,config);
 try{
  await contentEntered.promise;await sleep(950);contentRelease.resolve();await sending;
  assertEquals(sends.length-before,0);assertEquals((await state(x.d.id)).state,'cancelled');
 }finally{contentRelease.resolve();setContent('ok');await sending;await fixture.shutdown();}
}});
