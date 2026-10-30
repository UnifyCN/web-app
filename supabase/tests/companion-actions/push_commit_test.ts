// Drop a real PostgreSQL COMMIT acknowledgement after the server emitted COMMIT.
// This is a loopback protocol fault, not a mocked transaction/driver outcome.
import postgres from 'npm:postgres@3.4.9';
import { DB_URL } from './support.ts';
import { readyPush,sql,servers,policy,fresh,state,dispatch,config,sends,assert,assertEquals } from './pushHarness.ts';
await readyPush();await policy();await sql`select cron.alter_job(jobid,schedule:='1 second') from cron.job where jobname='companion-reminder-due'`;
const opts={sanitizeOps:false,sanitizeResources:false};
Deno.test({name:'push commit: lost COMMIT acknowledgement preserves the accepted ticket without resend',...opts,fn:async()=>{
 console.log('FALSIFIER: losing a committed reply creates a second provider request or removes the committed ticket');
 const fixture=servers(),x=await fresh('commit-ack'),before=sends.length;
 const listener=Deno.listen({hostname:'127.0.0.1',port:63616});const sockets=new Set<Deno.Conn>();
 let commits=0,dropped=false;
 async function copy(input:Deno.Conn,output:Deno.Conn,backend:boolean){
  const chunk=new Uint8Array(65536);let pending=new Uint8Array();
  try{while(true){const n=await input.read(chunk);if(n===null)break;
   if(!backend){let offset=0;while(offset<n)offset+=await output.write(chunk.subarray(offset,n));continue;}
   const data=new Uint8Array(pending.length+n);data.set(pending);data.set(chunk.subarray(0,n),pending.length);pending=data;
   while(pending.length>=5){const length=new DataView(pending.buffer,pending.byteOffset+1,4).getInt32(0);if(length<4||length>20_000_000)throw Error('invalid PostgreSQL frame');if(pending.length<length+1)break;
    const packet=pending.subarray(0,length+1);pending=pending.slice(length+1);
    if(packet[0]===67&&new TextDecoder().decode(packet.subarray(5))==='COMMIT\0'){
     commits++;if(commits===2&&!dropped){dropped=true;return;}
    }
    let offset=0;while(offset<packet.length)offset+=await output.write(packet.subarray(offset));
   }
  }}catch{/* expected socket close */}finally{try{input.close();}catch{}try{output.close();}catch{}sockets.delete(input);sockets.delete(output);}
 }
 const accepting=(async()=>{try{for await(const client of listener){const server=await Deno.connect({hostname:'127.0.0.1',port:63611});sockets.add(client);sockets.add(server);void copy(client,server,false);void copy(server,client,true);}}catch{/* listener closed */}})();
 const db=postgres(DB_URL.replace(':63611/',':63616/'),{max:1,connect_timeout:2,onnotice:()=>{}});
 try{
  await dispatch(db,x.d.id,config);assertEquals(dropped,true);assert(commits>=2);
  assertEquals((await state(x.d.id)).state,'ticket_accepted');assertEquals((await state(x.d.id)).attempt_count,1);
  await dispatch(db,x.d.id,config);assertEquals(sends.length-before,1);
  console.log(JSON.stringify({backend_commit_messages:commits,acknowledgement_dropped:dropped,provider_requests:sends.length-before}));
 }finally{await db.end({timeout:.2});listener.close();for(const s of sockets)try{s.close();}catch{}await accepting;await fixture.shutdown();}
}});
