import { ready, sql, sleep, API_URL, SERVICE_ROLE_KEY, call, uuid, type Account } from './support.ts';
export const PUSH_UP = new URL('../../migrations/20261030181040_companion_reminder_push.sql', import.meta.url);
export const PUSH_DOWN = new URL('../../rollbacks/20261030181040_companion_reminder_push.down.sql', import.meta.url);
export async function readyPush() {
  await ready();
  if (!(await sql`select to_regprocedure('companion_reminder_private.tick()') is not null present`)[0].present)
    await sql.begin(async t=>t.unsafe(await Deno.readTextFile(new URL('../../migrations/20261029175439_companion_task_reminders.sql',import.meta.url))));
  if (!(await sql`select to_regclass('public.push_tokens') is not null present`)[0].present) {
    await sql.unsafe(`create table public.push_tokens(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
      token text not null unique, platform text not null check(platform in ('ios','android','web')),created_at timestamptz default now(),updated_at timestamptz default now());
      alter table public.push_tokens enable row level security;
      create policy push_select on public.push_tokens for select to authenticated using(auth.uid()=user_id);
      create policy push_insert on public.push_tokens for insert to authenticated with check(auth.uid()=user_id);
      create policy push_update on public.push_tokens for update to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
      create policy push_delete on public.push_tokens for delete to authenticated using(auth.uid()=user_id);
      grant select,insert,update,delete on public.push_tokens to authenticated;`);
  }
  if (!(await sql`select to_regprocedure('public.companion_push_apply(uuid,uuid,uuid,integer,text,jsonb)') is not null present`)[0].present)
    await sql.begin(async t=>t.unsafe(await Deno.readTextFile(PUSH_UP)));
  for(let i=0;i<100;i++) {
    const r=await fetch(API_URL+'/rest/v1/',{headers:{apikey:SERVICE_ROLE_KEY,authorization:'Bearer '+SERVICE_ROLE_KEY}});
    if ('/rpc/companion_push_apply' in ((await r.json()).paths??{})) return;
    await sleep(50);
  }
  throw Error('push schema cache unavailable');
}
export async function localPolicy() {
  await sql`update companion_push_private.settings set enrollment_enabled=true, maximum_seconds=0,inactivity_seconds=0,
    policy_verified_at=now(),policy_valid_until=now()+interval '1 hour'`;
}
export const envelope=(action:string,extra:Record<string,unknown>={})=>({contract_version:1,client:{platform:'ios',app_version:'9.9.9'},action,...extra});
export const pushRequest=(operation:unknown,operation_id=uuid())=>envelope('push_apply',{operation_id,authorization:{kind:'ui_control'},operation});
export const proof=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
export const enrollOp=()=>({type:'push.enroll',installation_id:uuid(),installation_secret:proof(),expected_revision:0,token:'ExponentPushToken[synthetic369-'+uuid()+']',enabled:true,locale:'en'});
export const enroll=(a:Account,op=enrollOp(),id=uuid())=>call(a,pushRequest(op,id));
export const pushRead=(a:Account,op:ReturnType<typeof enrollOp>)=>call(a,envelope('push_read',{installation_id:op.installation_id,installation_secret:op.installation_secret}));
