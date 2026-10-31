import { assert, assertEquals } from 'jsr:@std/assert@1';
import { ANON_KEY, API_URL, apply, command, existingCustomTask, existingItem, holdOperationLock, interpret, newAccount, newItem, planApply, planPrepare, read, said, setState, sleep, sql, status, taskOf, testOpts, uuid } from './support.ts';
import { readyProfile } from './profileSupport.ts';
await readyProfile();

async function waitBlocked(pattern: string, count: number) {
  for (let i=0; i<100; i++) {
    const rows = await sql`select pid,wait_event,pg_blocking_pids(pid) blockers from pg_stat_activity
      where pid<>pg_backend_pid() and query like ${pattern} and cardinality(pg_blocking_pids(pid))>0`;
    if (rows.length>=count) return rows;
    await sleep(20);
  }
  throw Error('expected blocked requests: '+pattern);
}

Deno.test({ name: 'profile races: duplicate requests wait before commit, status is pending, and one receipt survives a lost reply', ...testOpts, fn: async () => {
  // Wrong if a blocked operation is reported applied, a retry writes twice, or another account sees the result.
  const a = await newAccount('profile-replay'), b = await newAccount('profile-isolated');
  const seed = await a.client.from('user_onboarding_profiles').insert({ id:a.id,province:'British Columbia' });
  if(seed.error) throw seed.error;
  const m=await said(a,'Update my profile province to Alberta');
  const op=(await interpret(a,m.message_id)).json.command.operation, id=uuid();
  const held=holdOperationLock(a.id,id);await held.ready;
  const requests=[apply(a,[op],{operation_id:id,authorization:command(m.message_id)}),apply(a,[op],{operation_id:id,authorization:command(m.message_id)})];
  try {
    const graph=await waitBlocked('%companion_apply_actions%',2);
    assertEquals((await read(a)).json.profile.province,'British Columbia');
    assertEquals((await status(a,id)).json.status,'pending');
    assertEquals((await sql`select count(*)::int n from companion_action_receipts where user_id=${a.id} and operation_id=${id}`)[0].n,0);
    console.log(JSON.stringify({scenario:'duplicate-before-commit',profile:'British Columbia',receipts:0,graph}));
  } finally { await held.release(); }
  const replies=await Promise.all(requests);
  assertEquals(replies.map(r=>r.status),[200,200]);
  assertEquals(replies.map(r=>r.json.replayed).sort(),[false,true]);
  // Discard both HTTP bodies. Lookup alone recovers the committed receipt.
  assertEquals((await status(a,id)).json.receipt.profile.after,'Alberta');
  assertEquals((await status(b,id)).json.status,'not_applied');
  assertEquals((await sql`select count(*)::int n from companion_action_receipts where user_id=${a.id} and operation_id=${id}`)[0].n,1);
} });

Deno.test({ name: 'profile races: a legacy profile transaction blocks old plan approval until a fresh committed context is read', ...testOpts, fn: async () => {
  // Wrong if approval commits while the profile writer owns the lock or uses its earlier snapshot after the wait.
  const a=await newAccount('profile-plan-wait');
  await a.client.from('user_onboarding_profiles').insert({id:a.id,province:'British Columbia',city:'Vancouver'}).throwOnError();
  const t=await existingCustomTask(a,'Synthetic SIN task');
  const draft=(await planPrepare(a,'Synthetic plan',[existingItem(t.ref),newItem('Synthetic bank task')])).json.plan_proposal;
  let release!:()=>void, acquired!:()=>void;
  const gate=new Promise<void>(r=>release=r), ready=new Promise<void>(r=>acquired=r);
  const writer=sql.begin(async tx=>{
    await tx`update user_onboarding_profiles set province='Alberta' where id=${a.id}`;
    acquired();await gate;
  });
  await ready;
  const saving=planApply(a,draft);
  try {
    const graph=await waitBlocked('%companion_plan_apply%',1);
    assertEquals((await read(a)).json.profile.province,'British Columbia');
    assertEquals((await sql`select count(*)::int n from companion_plans where user_id=${a.id}`)[0].n,0);
    assertEquals((await sql`select count(*)::int n from custom_checklist_tasks where user_id=${a.id}`)[0].n,1);
    console.log(JSON.stringify({scenario:'legacy-profile-first',plans:0,tasks:1,committedProvince:'British Columbia',graph}));
  } finally {release();await writer;}
  const blocked=await saving;
  assertEquals([blocked.status,blocked.json.error],[409,'needs_review'],JSON.stringify(blocked.json));
  assertEquals(blocked.json.plan_proposal.context.profile.province,'Alberta');
  assertEquals((await taskOf(a,t.ref)).state,'not_started');
} });

Deno.test({ name: 'profile races: simultaneous profile and task changes preserve progress and one profile revision wins', ...testOpts, fn: async () => {
  // Wrong if competing profile edits both win or task progress disappears when profile relevance changes.
  const a=await newAccount('profile-task-concurrent');
  await a.client.from('user_onboarding_profiles').insert({id:a.id,province:'British Columbia'}).throwOnError();
  const t=await existingCustomTask(a,'Synthetic concurrent task'), state=await taskOf(a,t.ref);
  const one=await said(a,'Update my profile province to Alberta'),two=await said(a,'Update my profile province to Ontario');
  const ops=await Promise.all([interpret(a,one.message_id),interpret(a,two.message_id)]);
  const rs=await Promise.all([apply(a,[ops[0].json.command.operation],{authorization:command(one.message_id)}),
    apply(a,[ops[1].json.command.operation],{authorization:command(two.message_id)}),apply(a,[setState(t.ref,'completed',state.revision)])]);
  assertEquals(rs.slice(0,2).map(r=>r.status).sort(),[200,409]);assertEquals(rs[2].status,200);
  assertEquals((await taskOf(a,t.ref)).state,'completed');
  const p=(await read(a)).json.profile;
  assert(['Alberta','Ontario'].includes(p.province));assertEquals(p.revisions.province,2);
} });

Deno.test({name:'profile races: a task transaction holds its reviewed profile stable until commit; the delayed legacy writer then saves without losing progress',...testOpts,fn:async()=>{
  // Wrong if the legacy profile commits between the approval's context read and its task commit.
  const a=await newAccount('profile-task-first');
  await a.client.from('user_onboarding_profiles').insert({id:a.id,province:'British Columbia'}).throwOnError();
  const t=await existingCustomTask(a,'Synthetic preserved SIN task');
  const draft=(await planPrepare(a,'Synthetic ordered plan',[existingItem(t.ref),newItem('Profile371 held insertion '+uuid())])).json.plan_proposal;
  await sql.unsafe(`create function public.profile371_pause_insert() returns trigger language plpgsql as $$
    begin if new.title like 'Profile371 held insertion %' then perform pg_advisory_xact_lock(371,42);end if;return new;end $$;
    create trigger profile371_pause_insert before insert on public.custom_checklist_tasks for each row execute function public.profile371_pause_insert();`);
  let release!:()=>void, acquired!:()=>void;
  const gate=new Promise<void>(r=>release=r),ready=new Promise<void>(r=>acquired=r);
  const holder=sql.begin(async tx=>{await tx`select pg_advisory_xact_lock(371,42)`;acquired();await gate;});await ready;
  const saving=planApply(a,draft);
  let legacy: PromiseLike<unknown> | null=null;
  try{
    await waitBlocked('%companion_plan_apply%',1);
    legacy=a.client.from('user_onboarding_profiles').update({province:'Ontario'}).eq('id',a.id).then(r=>{if(r.error)throw r.error;return r;});
    const observation=await Promise.race([
      waitBlocked('%user_onboarding_profiles%',1).then(graph=>({graph,phase:'blocked'})),
      Promise.resolve(legacy).then(()=>({graph:[],phase:'committed'})),
    ]);
    assertEquals((await read(a)).json.profile.province,'British Columbia');
    assertEquals(observation.phase,'blocked');
    assertEquals((await sql`select count(*)::int n from companion_plans where user_id=${a.id}`)[0].n,0);
    console.log(JSON.stringify({scenario:'task-first-before-commit',profile:'British Columbia',plans:0,graph:observation.graph}));
    release();await holder;
    assertEquals((await saving).status,200);await legacy;
    assertEquals((await read(a)).json.profile.province,'Ontario');
    assertEquals((await taskOf(a,t.ref)).state,'not_started');
    assertEquals((await sql`select count(*)::int n from companion_plans where user_id=${a.id}`)[0].n,1);
  }finally{
    release();await holder;await saving;await legacy;
    await sql.unsafe('drop trigger profile371_pause_insert on public.custom_checklist_tasks;drop function public.profile371_pause_insert()');
  }
} });

Deno.test({name:'profile races: legacy UPDATE and UPSERT serialize without a row/insert-trigger lock cycle',...testOpts,fn:async()=>{
  // Wrong if a released legacy update and upsert deadlock or lose either committed update.
  const a=await newAccount('profile-legacy-upsert');
  await a.client.from('user_onboarding_profiles').insert({id:a.id,province:'British Columbia'}).throwOnError();
  await sql.unsafe(`create function public.profile371_pause_legacy() returns trigger language plpgsql as $$
    begin if new.province='Ontario' then perform pg_advisory_xact_lock(371,43);end if;return new;end $$;
    create trigger a_profile371_pause_legacy before update on public.user_onboarding_profiles for each row execute function public.profile371_pause_legacy();`);
  let release!:()=>void,acquired!:()=>void;
  const gate=new Promise<void>(r=>release=r),ready=new Promise<void>(r=>acquired=r);
  const holder=sql.begin(async tx=>{await tx`select pg_advisory_xact_lock(371,43)`;acquired();await gate;});await ready;
  const update=a.client.from('user_onboarding_profiles').update({province:'Ontario'}).eq('id',a.id).then(r=>r);
  let upsert: typeof update | null=null;
  try{
    await waitBlocked('%user_onboarding_profiles%',1);
    upsert=a.client.from('user_onboarding_profiles').upsert({id:a.id,province:'Quebec'}).then(r=>r);
    const graph=await waitBlocked('%user_onboarding_profiles%',2);
    assertEquals((await read(a)).json.profile.province,'British Columbia');
    release();await holder;
    const results=await Promise.all([update,upsert]);
    console.log(JSON.stringify({scenario:'legacy-update-upsert',graph,errors:results.map(r=>r?.error?.code??null)}));
    assertEquals(results.map(r=>r?.error?.code??null),[null,null]);
    assertEquals((await read(a)).json.profile.province,'Quebec');
    assertEquals((await read(a)).json.profile.revisions.province,3);
  }finally{
    release();await holder;await update;await upsert;
    await sql.unsafe('drop trigger a_profile371_pause_legacy on public.user_onboarding_profiles;drop function public.profile371_pause_legacy()');
  }
} });

Deno.test({name:'profile races: a first profile INSERT waits until a task with a missing-profile review commits',...testOpts,fn:async()=>{
  // Wrong if the first profile row commits after the context read but before the held task commits.
  const a=await newAccount('profile-first-insert');
  const t=await existingCustomTask(a,'Synthetic task before onboarding');
  const draft=(await planPrepare(a,'Profile371 absent insertion '+uuid(),[existingItem(t.ref),newItem('Synthetic task with no saved profile')])).json.plan_proposal;
  await sql.unsafe(`create function public.profile371_pause_missing() returns trigger language plpgsql as $$
    begin if new.goal like 'Profile371 absent insertion %' then perform pg_advisory_xact_lock(371,44);end if;return new;end $$;
    create trigger profile371_pause_missing before insert on public.companion_plans for each row execute function public.profile371_pause_missing();`);
  let release!:()=>void,acquired!:()=>void;
  const gate=new Promise<void>(r=>release=r),ready=new Promise<void>(r=>acquired=r);
  const holder=sql.begin(async tx=>{await tx`select pg_advisory_xact_lock(371,44)`;acquired();await gate;});await ready;
  const saving=planApply(a,draft);
  let legacy:PromiseLike<unknown>|null=null;
  try{
    await waitBlocked('%companion_plan_apply%',1);
    legacy=a.client.from('user_onboarding_profiles').upsert({id:a.id,province:'Ontario'}).then(r=>{if(r.error)throw r.error;return r;});
    const observation=await Promise.race([
      waitBlocked('%user_onboarding_profiles%',1).then(graph=>({graph,phase:'blocked'})),
      Promise.resolve(legacy).then(()=>({graph:[],phase:'committed'})),
    ]);
    assertEquals((await read(a)).json.profile,null);
    assertEquals(observation.phase,'blocked');
    assertEquals((await sql`select count(*)::int n from companion_plans where user_id=${a.id}`)[0].n,0);
    console.log(JSON.stringify({scenario:'first-profile-insert-before-task-commit',profile:null,plans:0,graph:observation.graph}));
    release();await holder;
    assertEquals((await saving).status,200);await legacy;
    assertEquals((await read(a)).json.profile.province,'Ontario');
    assertEquals((await taskOf(a,t.ref)).state,'not_started');
    assertEquals((await sql`select count(*)::int n from companion_plans where user_id=${a.id}`)[0].n,1);
  }finally{
    release();await holder;await saving;await legacy;
    await sql.unsafe('drop trigger profile371_pause_missing on public.companion_plans;drop function public.profile371_pause_missing()');
  }
} });

Deno.test({name:'profile isolation: a foreign UPSERT is refused before it can wait on another account row',...testOpts,fn:async()=>{
  // Wrong if a rejected caller reaches the foreign account lock before the owner check.
  const a=await newAccount('profile-lock-owner-a'),b=await newAccount('profile-lock-owner-b');
  await b.client.from('user_onboarding_profiles').insert({id:b.id,province:'British Columbia'}).throwOnError();
  let release!:()=>void,acquired!:(pid:number)=>void;
  const gate=new Promise<void>(r=>release=r),ready=new Promise<number>(r=>acquired=r);
  const holder=sql.begin(async tx=>{await tx`select 1 from auth.users where id=${b.id} for update`;
    const [{pid}]=await tx`select pg_backend_pid() pid`;acquired(pid);await gate;});const ownerPid=await ready;
  let pending:Promise<unknown>|null=null;
  try{
    for(const [actor,token] of [['foreign_user',a.jwt],['anonymous',ANON_KEY]]){
      let done=false;
      const response=fetch(API_URL+'/rest/v1/user_onboarding_profiles?on_conflict=id',{method:'POST',headers:{
        apikey:ANON_KEY,authorization:'Bearer '+token,'content-type':'application/json',prefer:'resolution=merge-duplicates'},
        body:JSON.stringify({id:b.id,province:'Ontario'})}).then(async r=>({kind:'replied' as const,status:r.status,code:(await r.json()).code}));
      pending=response;
      const blocked=(async()=>{
        for(let i=0;i<100&&!done;i++){
          const graph=await sql`select pid,wait_event,pg_blocking_pids(pid) blockers from pg_stat_activity
            where query like '%user_onboarding_profiles%' and ${ownerPid}::int=any(pg_blocking_pids(pid))`;
          if(graph.length)return {kind:'blocked' as const,graph};await sleep(20);
        }
        return {kind:'stopped' as const};
      })();
      try{
        const observed=await Promise.race([response,blocked]);done=true;
        assertEquals(observed.kind,'replied',JSON.stringify({actor,observed}));
        if(observed.kind==='replied')assertEquals([observed.status,observed.code],[actor==='anonymous'?401:403,'42501']);
      }finally{done=true;await blocked;}
      // A successful refusal resolves while the foreign row is still locked.
      await response;
    }
  }finally{release();await holder;await pending;}
  assertEquals((await b.client.from('user_onboarding_profiles').select('province').single()).data?.province,'British Columbia');
} });
