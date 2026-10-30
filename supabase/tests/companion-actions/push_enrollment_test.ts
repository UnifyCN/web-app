// Public JWT action contract. Synthetic accounts and persisted outcomes only.
import { assertEquals } from 'jsr:@std/assert@1.0.19';
import { newAccount, call, uuid, sql } from './support.ts';
import { readyPush, localPolicy, enroll, enrollOp, pushRead, envelope, proof } from './pushSupport.ts';
await readyPush();
await sql`update companion_push_private.settings set enrollment_enabled=false,dispatch_enabled=false`;
const opts = { sanitizeOps: false, sanitizeResources: false };
const a = await newAccount('push369-enrollment');
export const pushRequest = (operation: unknown, operation_id = uuid()) => ({
  contract_version: 1, client: { platform: 'ios', app_version: '9.9.9' },
  action: 'push_apply', operation_id, authorization: { kind: 'ui_control' }, operation,
});
Deno.test({ name: 'push enrollment: disabled server retains no enrollment or token', ...opts, fn: async () => {
  console.log('FALSIFIER: disabled enrollment writes or does not return push_disabled');
  const r = await call(a, pushRequest({ type: 'push.enroll', installation_id: uuid(),
    installation_secret: '01'.repeat(32), token: 'ExponentPushToken[synthetic369]', expected_revision: 0,
    enabled: true, locale: 'en' }));
  assertEquals(r.status, 503);
  assertEquals(r.json.error, 'push_disabled');
  const [n] = await sql`select count(*)::int n from public.companion_action_receipts where user_id=${a.id}::uuid`;
  assertEquals(n.n, 0);
}});
Deno.test({ name: 'push enrollment: authenticated save replays one revision and a content-free receipt', ...opts, fn: async () => {
  console.log('FALSIFIER: enabled save fails, duplicate requests rotate twice, or proof/token enters receipt');
  // The adapter configures verified local Auth defaults explicitly. No production default.
  const policy = await sql`select to_regclass('companion_push_private.settings') is not null present`;
  if (policy[0].present) await sql`update companion_push_private.settings set enrollment_enabled=true,
    maximum_seconds=0,inactivity_seconds=0,policy_verified_at=now(),policy_valid_until=now()+interval '1 hour'`;
  const operation = { type: 'push.enroll', installation_id: uuid(), installation_secret: '02'.repeat(32),
    expected_revision: 0, token: 'ExponentPushToken[synthetic369-replay-'+uuid()+']', enabled: true, locale: 'fr-CA' };
  const request = pushRequest(operation);
  const replies = await Promise.all([call(a, request), call(a, request)]);
  assertEquals(replies.map(r=>r.status), [200,200]);
  assertEquals(replies.map(r=>r.json.replayed).sort(), [false,true]);
  assertEquals(replies[0].json.results[0].after_revision, 1);
  const text = JSON.stringify(replies);
  assertEquals(text.includes(operation.installation_secret), false);
  assertEquals(text.includes(operation.token), false);
}});
Deno.test({name:'push enrollment: known installation requires proof even for the current account',...opts,fn:async()=>{
 console.log('FALSIFIER: missing or wrong proof mutates a known installation');await localPolicy();
 const op=enrollOp();assertEquals((await enroll(a,op)).status,200);
 for(const secret of [undefined,'00'.repeat(32),'malformed']) {
  const r=await call(a,pushRequest({...op,installation_secret:secret,expected_revision:1}));
  assertEquals([403,422].includes(r.status),true);
 }
 const got=await pushRead(a,op);assertEquals(got.json.enrollment.revision,1);
 const row=await sql`select credential_hash=extensions.digest(${op.installation_secret},'sha256') correct from companion_push_private.enrollments where installation_id=${op.installation_id}::uuid`;
 assertEquals(row[0].correct,true);
 assertEquals((await call(a,envelope('push_read',{installation_id:op.installation_id,installation_secret:proof()}))).json.enrollment,null);
}});
Deno.test({name:'push enrollment: transfer needs possession and removal of the earlier server session',...opts,fn:async()=>{
 console.log('FALSIFIER: active-session transfer succeeds, or signed-out known id is reclaimed without proof');await localPolicy();
 const owner=await newAccount('push369-owner'),other=await newAccount('push369-other'),op=enrollOp();
 assertEquals((await enroll(owner,op)).status,200);
 assertEquals((await enroll(other,{...op,expected_revision:1})).status,403);
 const logout=await owner.client.auth.signOut();assertEquals(logout.error,null);
 assertEquals([401,403].includes((await enroll(owner,{...op,expected_revision:1})).status),true);
 assertEquals((await enroll(other,{...op,installation_secret:proof(),expected_revision:1})).status,403);
 assertEquals((await enroll(other,{...op,expected_revision:1})).status,200);
 const [row]=await sql`select n.user_id,p.user_id token_owner,n.revision from companion_push_private.enrollments n join push_tokens p on p.id=n.token_id where n.installation_id=${op.installation_id}::uuid`;
 assertEquals(row.user_id,other.id);assertEquals(row.token_owner,other.id);assertEquals(Number(row.revision),2);
}});
Deno.test({name:'push enrollment: different-token transfer preserves the earlier social and learn token',...opts,fn:async()=>{
 console.log('FALSIFIER: verified transfer deletes or reassigns an unrelated old shared token');await localPolicy();
 const owner=await newAccount('push369-old-token'),other=await newAccount('push369-new-token'),op=enrollOp();
 assertEquals((await enroll(owner,op)).status,200);await owner.client.auth.signOut();
 const changed={...op,token:enrollOp().token,expected_revision:1};assertEquals((await enroll(other,changed)).status,200);
 assertEquals((await sql`select user_id from push_tokens where token=${op.token}`)[0].user_id,owner.id);
 assertEquals((await sql`select user_id from push_tokens where token=${changed.token}`)[0].user_id,other.id);
}});
Deno.test({name:'push enrollment: token collision is atomic for same-account and cross-account races',...opts,fn:async()=>{
 console.log('FALSIFIER: a collision creates two bindings or an orphan token mutation');await localPolicy();
 for(const same of [true,false]){
  const x=await newAccount('push369-collision-a'),y=same?x:await newAccount('push369-collision-b');
  const left=enrollOp(),right={...enrollOp(),token:left.token};
  const rs=await Promise.all([enroll(x,left),enroll(y,right)]);
  assertEquals(rs.map(r=>r.status).sort(),[200,409]);
  assertEquals((await sql`select count(*)::int n from companion_push_private.enrollments n join push_tokens p on p.id=n.token_id where p.token=${left.token}`)[0].n,1);
 }
}});
Deno.test({name:'push enrollment: lost replies, revision conflict, rotation, disable, and terminal revocation',...opts,fn:async()=>{
 console.log('FALSIFIER: retry rotates twice, stale revision changes state, or revoked credentials can enroll');await localPolicy();
 const op=enrollOp(),id=uuid();await enroll(a,op,id);
 const replay=await enroll(a,op,id);assertEquals(replay.status,200);assertEquals(replay.json.replayed,true);
 const old=replay.json.results[0].generation;
 assertEquals((await enroll(a,{...op,token:enrollOp().token})).status,409);
 const rotated={...op,token:enrollOp().token,expected_revision:1};const save=await enroll(a,rotated);assertEquals(save.status,200);
 assertEquals(save.json.results[0].generation===old,false);
 const disabled=await call(a,pushRequest({type:'push.disable',installation_id:op.installation_id,installation_secret:op.installation_secret,expected_revision:2}));
 assertEquals(disabled.status,200);assertEquals(disabled.json.results[0].enabled,false);
 const revoked=await call(a,pushRequest({type:'push.revoke',installation_id:op.installation_id,installation_secret:op.installation_secret,expected_revision:3}));
 assertEquals(revoked.status,200);assertEquals(revoked.json.results[0].revoked,true);
 assertEquals((await enroll(a,{...op,expected_revision:4})).status,403);
 const reused=await enroll(a,{...enrollOp()},id);assertEquals(reused.status,409);
}});
Deno.test({name:'push enrollment: unknown, expired, revoked, maximum-lifetime and inactive sessions fail closed',...opts,fn:async()=>{
 console.log('FALSIFIER: an old JWT creates enrollment after session authorization expires');
 for(const kind of ['missing-policy','not-after','maximum','inactive','deleted']){
  await localPolicy();const who=await newAccount('push369-session-'+kind);
  if(kind==='missing-policy')await sql`update companion_push_private.settings set policy_verified_at=null`;
  if(kind==='not-after')await sql`update auth.sessions set not_after=now()-interval '1 second' where user_id=${who.id}::uuid`;
  if(kind==='maximum'){await sql`update companion_push_private.settings set maximum_seconds=60`;await sql`update auth.sessions set created_at=now()-interval '2 minutes' where user_id=${who.id}::uuid`;}
  if(kind==='inactive'){await sql`update companion_push_private.settings set inactivity_seconds=60`;await sql`update auth.sessions set created_at=now()-interval '2 minutes',refreshed_at=(now()-interval '2 minutes') at time zone 'UTC' where user_id=${who.id}::uuid`;}
  if(kind==='deleted')await who.client.auth.signOut();
  assertEquals([401,403].includes((await enroll(who)).status),true,kind);
  assertEquals((await sql`select count(*)::int n from companion_push_private.enrollments where user_id=${who.id}::uuid`)[0].n,0);
 }
 await localPolicy();assertEquals((await call(null,pushRequest(enrollOp()))).status,401);
}});
Deno.test({name:'push enrollment: RLS grants and the common operation namespace reject bypass',...opts,fn:async()=>{
 console.log('FALSIFIER: a normal JWT calls the privileged RPC, reads private storage, or reuses another action identity');await localPolicy();
 const op=enrollOp(),id=uuid();assertEquals((await enroll(a,op,id)).status,200);
 const direct=await a.client.rpc('companion_push_apply',{p_user:a.id,p_session:uuid(),p_operation_id:uuid(),p_version:1,p_platform:'ios',p_operation:op});
 assertEquals(!!direct.error,true);
 const [{n}]=await sql`select count(*)::int n from pg_class c join pg_namespace s on s.oid=c.relnamespace where s.nspname='companion_push_private' and c.relkind='r'
  and (not c.relrowsecurity or has_table_privilege('authenticated',c.oid,'select') or has_table_privilege('anon',c.oid,'insert'))`;
 assertEquals(n,0);
 const other=await newAccount('push369-privacy');assertEquals((await pushRead(other,op)).json.enrollment,null);
 const forged=await call(a,{...pushRequest(enrollOp()),user_id:other.id});assertEquals(forged.status,422);
 const command=await call(a,{...pushRequest(enrollOp()),authorization:{kind:'direct_command',message_id:1}});assertEquals(command.status,403);
 const receipt=await sql`select outcome,authorization_evidence from companion_action_receipts where user_id=${a.id}::uuid and operation_id=${id}::uuid`;
 assertEquals(JSON.stringify(receipt).includes(op.token),false);assertEquals(JSON.stringify(receipt).includes(op.installation_secret),false);
}});
