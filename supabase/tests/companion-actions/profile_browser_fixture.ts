// Owned local shell fixture only. These extra columns support the real Next.js page.
import { existingCustomTask, newAccount, planPrepare, existingItem, newItem, said, sql } from './support.ts';
import { readyProfile } from './profileSupport.ts';
await readyProfile();
await sql.unsafe(`alter table public.users
  add column if not exists username text default 'synthetic371',
  add column if not exists first_name text default 'Synthetic',
  add column if not exists profile_picture_url text,
  add column if not exists is_premium boolean default false,
  add column if not exists permissions text default 'user',
  add column if not exists biography text,
  add column if not exists pronouns text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists privacy_policy_accepted_at timestamptz default now();
  alter table public.user_onboarding_profiles
  add column if not exists referral_source text,
  add column if not exists goals text[] default '{}',
  add column if not exists learning_interests text[] default '{}',
  add column if not exists hobbies text[] default '{}',
  add column if not exists onboarding_completed boolean default true,
  add column if not exists preferred_language text default 'en';
  alter table public.conversations add column if not exists updated_at timestamptz default now();
  alter table public.messages add column if not exists sources jsonb,add column if not exists suggested_next_steps jsonb;
  do $$begin if not exists(select 1 from pg_policies where schemaname='public' and tablename='chatbot_usage' and policyname='profile371_fixture_usage') then
    create policy profile371_fixture_usage on public.chatbot_usage for select to authenticated using(auth.uid()=user_id);end if;end $$;
  notify pgrst,'reload schema';`);
const people=[];
for (const [label,province] of [['browser-a','British Columbia'],['browser-b','Quebec']]) {
  const a=await newAccount('profile371-'+label);
  await sql`insert into public.user_onboarding_profiles(id,province,city,persona,arrival_date,stage,onboarding_completed)
    values(${a.id},${province},'Vancouver','skilled_worker','2026-11-07',0,true)`;
  const t=await existingCustomTask(a,'Synthetic retained SIN progress');
  await sql`update public.custom_checklist_tasks set completed=true where user_id=${a.id} and id=${t.id}`;
  const m=await said(a,'Synthetic profile review history');
  const p=await planPrepare(a,'Synthetic settlement plan',[existingItem(t.ref),newItem('Synthetic phone task')],{source:{conversation_id:m.conversation_id,message_id:m.message_id}});
  if(p.status!==200)throw Error('plan fixture unavailable');
  const session=(await a.client.auth.getSession()).data.session;
  people.push({id:a.id,session,conversationId:m.conversation_id,taskRef:t.ref,planProposalId:p.json.plan_proposal.plan_proposal_id});
}
const path=Deno.env.get('ACTIONS_PROFILE_PRIVATE_FIXTURE');
if(!path)throw Error('Owned private fixture path required');
await Deno.writeTextFile(path,JSON.stringify({people}));
console.log(JSON.stringify({fixture:'real Next.js shell',accounts:people.length,private_file_written:true,production_schema:false}));
await sql.end();
