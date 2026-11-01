import { createClient } from 'jsr:@supabase/supabase-js@2';
// Same public handler with real JWT/Auth/PostgREST and controlled published content.
import { assertEquals } from 'jsr:@std/assert@1.0.19';
import { sql,API_URL,ANON_KEY,SERVICE_ROLE_KEY,newAccount,setProfile,uuid } from './support.ts';
import { readyPush,localPolicy,enroll,enrollOp,envelope } from './pushSupport.ts';
import { createHandler } from '../../functions/companion-actions/handler.ts';
import { createTaskLister } from '../../functions/companion-actions/targets.ts';
await readyPush();await localPolicy();
const admin=createClient(API_URL,SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const opts={sanitizeOps:false,sanitizeResources:false};
Deno.test({name:'push target: owner first, same published task across accounts, current profile access and removal',...opts,fn:async()=>{
 console.log('FALSIFIER: B resolves A delivery for the same published id, or a removed/inaccessible target is returned');
 const a=await newAccount('push369-published-a'),b=await newAccount('push369-published-b'),op=enrollOp();assertEquals((await enroll(a,op)).status,200);
 await setProfile(a,{persona:'newcomer',stage:1,province:'BC'});await setProfile(b,{persona:'newcomer',stage:1,province:'BC'});
 for(const who of [a,b])assertEquals((await who.client.from('user_tasks').insert({user_id:who.id,sanity_checklist_id:'sin-number',completed:false})).error,null);
 const id=uuid();await sql`insert into companion_push_private.deliveries(id,reminder_id,user_id,task_ref,installation_id,generation,token_id,state)
  select ${id}::uuid,${uuid()}::uuid,user_id,'sanity:sin-number',installation_id,generation,token_id,'unknown' from companion_push_private.enrollments where installation_id=${op.installation_id}::uuid`;
 const original=globalThis.fetch;let available=true,contentReads=0;
 globalThis.fetch=(input,init)=>{
  if(String(input).startsWith('https://fixture369.apicdn.sanity.io/')){contentReads++;return Promise.resolve(Response.json({result:available?[{_id:'sin-number',_rev:'1',title:'Synthetic',province:'BC'}]:[]}));}
  return original(input,init);
 };
 try{
  const handle=createHandler({admin,listTasks:createTaskLister({supabaseUrl:API_URL,anonKey:ANON_KEY,sanity:{projectId:'fixture369',dataset:'production'}}),log:()=>{}});
  const target=async(who:typeof a)=>{const r=await handle(new Request(API_URL+'/functions/v1/companion-actions',{method:'POST',headers:{authorization:'Bearer '+who.jwt},body:JSON.stringify(envelope('push_resolve',{delivery_id:id,language:'en'}))}));assertEquals(r.status,200);return r.json();};
  assertEquals(await target(b),{target:'unavailable'});assertEquals(contentReads,0);
  assertEquals(await target(a),{target:'available',task_ref:'sanity:sin-number'});
  available=false;assertEquals(await target(a),{target:'unavailable'});available=true;
  await setProfile(a,{persona:'newcomer',stage:1,province:'ON'});assertEquals(await target(a),{target:'unavailable'});
  await setProfile(a,{persona:'newcomer',stage:1,province:'BC'});
  assertEquals((await a.client.from('user_tasks').update({dismissed_at:new Date().toISOString()}).eq('user_id',a.id).eq('sanity_checklist_id','sin-number')).error,null);
  assertEquals(await target(a),{target:'unavailable'});
 }finally{globalThis.fetch=original;}
}});
