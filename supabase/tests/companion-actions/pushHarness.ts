// Real local Auth, SQL, Cron and HTTP. Only content/provider transport is controlled.
import { assert, assertEquals } from 'jsr:@std/assert@1.0.19';
import { sql,newAccount,existingCustomTask,taskOf,apply,read,uuid,sleep,setProfile,call } from './support.ts';
import { readyPush,localPolicy,enroll,enrollOp,envelope } from './pushSupport.ts';
import { enqueue,dispatch,type WorkerConfig } from '../../workers/companion-push/worker.ts';
export const config:WorkerConfig={fixture:true,providerURL:'http://127.0.0.1:63615',contentURL:'http://127.0.0.1:63614/content',projectId:'fixture369'};
export const latch=()=>{let resolve!:()=>void;const promise=new Promise<void>(r=>resolve=r);return {promise,resolve};};
export let entered=latch(),release=latch(),contentEntered=latch(),contentRelease=latch();
export let contentMode='ok';
export const setContent=(mode:string)=>{contentMode=mode;contentEntered=latch();contentRelease=latch();};
export const modes=new Map<string,string>();
export const sends:{delivery_id:string;mode:string;keys:string[];data:unknown}[]=[];
export let receiptMode='ok';
export const setReceipt=(mode:string)=>receiptMode=mode;
export const hold=()=>{entered=latch();release=latch();};
export function servers(){
 const provider=Deno.serve({hostname:'127.0.0.1',port:63615,onListen:()=>{}},async req=>{
  const b=await req.json();
  if(new URL(req.url).pathname==='/receipts')return Response.json({data:receiptMode==='lost'?{}:{[b.ids[0]]:receiptMode==='invalid'?{status:'error',details:{error:'DeviceNotRegistered'}}:{status:'ok'}}});
  assert(typeof b.to==='string'&&b.to.startsWith('ExponentPushToken[synthetic369-'),'fixture accepts only synthetic tokens');
  const mode=modes.get(b.to)??'ok';
  sends.push({delivery_id:b.data.delivery_id,mode,keys:Object.keys(b).sort(),data:b.data});
  if(mode==='hold'){entered.resolve();await release.promise;}
  const ticket={data:{status:'ok',id:'synthetic-ticket-'+uuid()}};
  if(mode==='body'){
   entered.resolve();return new Response(new ReadableStream({async start(c){c.enqueue(new TextEncoder().encode('{'));await release.promise;try{c.enqueue(new TextEncoder().encode(JSON.stringify(ticket).slice(1)));c.close();}catch{/* aborted reader */}}}));
  }
  if(mode==='reject')return Response.json({errors:[{code:'TOO_MANY_REQUESTS'}]},{status:429});
  if(mode==='invalid')return Response.json({data:{status:'error',details:{error:'DeviceNotRegistered'}}});
  if(mode==='rate')return Response.json({data:{status:'error',details:{error:'MessageRateExceeded'}}});
  if(mode==='lost')return new Response('{lost');
  return Response.json(ticket);
 });
 const content=Deno.serve({hostname:'127.0.0.1',port:63614,onListen:()=>{}},async req=>{
  const url=new URL(req.url),worker=url.searchParams.has('$persona');
  let id:string|null=null;try{id=JSON.parse(url.searchParams.get('$id')??'null');}catch{/* invalid */}
  const result=worker?(contentMode==='absent'?[]:[{_id:'sin-number',_rev:'synthetic',title:'Synthetic public content',province:'BC'}]):id;
  const body=JSON.stringify({result});
  if(worker&&['headers','body'].includes(contentMode)){
   contentEntered.resolve();if(contentMode==='headers')await contentRelease.promise;
   else return new Response(new ReadableStream({async start(c){c.enqueue(new TextEncoder().encode('{'));await contentRelease.promise;try{c.enqueue(new TextEncoder().encode(body.slice(1)));c.close();}catch{/* aborted */}}}));
  }
  return new Response(body,{headers:{'content-type':'application/json'}});
 });
 return {shutdown:async()=>{release.resolve();contentRelease.resolve();await Promise.all([provider.shutdown(),content.shutdown()]);
  const distribution:Record<string,number>={};for(const row of sends)distribution[row.mode]=(distribution[row.mode]??0)+1;
  console.log(JSON.stringify({kind:'provider_fixture_distribution',total:sends.length,modes:distribution}));
 }};
}
export async function policy(){
 await localPolicy();
 await sql`update companion_push_private.settings set dispatch_enabled=true,dispatch_not_before=now()-interval '1 hour',
 companion_per_minute=100,provider_project_per_second=600,other_senders_reserved_per_second=500,
 aggregate_verified_at=now(),aggregate_valid_until=now()+interval '1 hour',receipt_per_minute=100`;
 await sql`update companion_push_private.budget set blocked_until=now(),sends_second=0,sends_minute=0,receipts_minute=0`;
}
export async function until<T>(get:()=>Promise<T>,match:(v:T)=>boolean,label:string,ms=12000):Promise<T>{
 const end=Date.now()+ms;
 do{const v=await get();if(match(v))return v;await sleep(15);}while(Date.now()<end);
 throw Error('SETUP_TIMEOUT '+label);
}
export async function fresh(label:string,content=false,enabled=true){
 await policy();const a=await newAccount('push369-'+label),op=enrollOp();op.enabled=enabled;
 const e=await enroll(a,op);assertEquals(e.status,200,JSON.stringify(e.json));
 const t=content?{ref:'sanity:sin-number',id:null}:await existingCustomTask(a,'Synthetic private task');
 if(content)await setProfile(a,{persona:'newcomer',stage:1,province:'BC',wants_reminders:false});
 const rev=content?0:(await taskOf(a,t.ref)).revision,instant=new Date(Date.now()+1100).toISOString();
 const reminder={type:'reminder.schedule',task_ref:t.ref,expected_revision:rev,remind_at:instant,time_zone:'Etc/UTC',wall_time:instant.slice(0,-1)};
 const operation_id=uuid();const saved=await apply(a,[reminder],{operation_id});assertEquals(saved.status,200,JSON.stringify(saved.json));
 const rid=saved.json.results[0].reminder_id;
 await until(()=>sql`select count(*)::int n from companion_reminder_private.events where reminder_id=${rid}::uuid`,r=>r[0].n===1,'real Cron event');
 await enqueue(sql);const [d]=await sql`select * from companion_push_private.deliveries where reminder_id=${rid}::uuid`;
 return {a,t,rev,rid,d,op,reminder,operation_id};
}
export const state=async(id:string)=>(await sql`select * from companion_push_private.deliveries where id=${id}::uuid`)[0];
export const visible=async(x:Awaited<ReturnType<typeof fresh>>)=>{
 const r=await read(x.a);assertEquals(r.status,200);return {task:r.json.tasks.find((t:{task_ref:string})=>t.task_ref===x.t.ref),reminder:r.json.reminders.items.find((r:{reminder_id:string})=>r.reminder_id===x.rid)};
};
export const resolve=(a:Awaited<ReturnType<typeof newAccount>>,id:string)=>call(a,envelope('push_resolve',{delivery_id:id,language:'en'}));
export { readyPush,sql,dispatch,assert,assertEquals };
