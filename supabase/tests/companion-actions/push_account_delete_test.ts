import { admin } from './support.ts';
import { readyPush,sql,servers,policy,fresh,dispatch,config,assertEquals } from './pushHarness.ts';
await readyPush();await policy();await sql`select cron.alter_job(jobid,schedule:='1 second') from cron.job where jobname='companion-reminder-due'`;
const opts={sanitizeOps:false,sanitizeResources:false};
Deno.test({name:'push account deletion: new attempt history does not block Auth account deletion',...opts,fn:async()=>{
 console.log('FALSIFIER: retained attempt foreign keys prevent deletion of the synthetic Auth account');
 const fixture=servers();const x=await fresh('delete-account');
 try{
  await dispatch(sql,x.d.id,config);
  assertEquals((await sql`select count(*)::int n from companion_push_private.attempts where delivery_id=${x.d.id}::uuid`)[0].n,1);
  const removed=await admin.auth.admin.deleteUser(x.a.id);assertEquals(removed.error,null);
  assertEquals((await sql`select count(*)::int n from companion_push_private.deliveries where id=${x.d.id}::uuid`)[0].n,0);
  assertEquals((await sql`select count(*)::int n from companion_push_private.attempts where delivery_id=${x.d.id}::uuid`)[0].n,0);
 }finally{await fixture.shutdown();}
}});
