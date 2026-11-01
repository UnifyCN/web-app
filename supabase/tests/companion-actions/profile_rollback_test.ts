import { assertEquals } from 'jsr:@std/assert@1';
import { apply, command, interpret, newAccount, prepare, read, said, sql, status, testOpts } from './support.ts';
import { PROFILE_DOWN, PROFILE_UP, readyProfile, waitProfileSchema } from './profileSupport.ts';
await readyProfile();
Deno.test({name:'profile rollback: profile facts remain, exact previous function definitions return, and reapply retains recoverable receipt history',...testOpts,fn:async()=>{
  // Wrong if rollback changes saved facts, loses receipts, leaves profile RPCs executable, or drops an earlier function branch.
  const a=await newAccount('profile-rollback');
  await a.client.from('user_onboarding_profiles').insert({id:a.id,province:'British Columbia'}).throwOnError();
  const m=await said(a,'Update my profile province to Alberta'),op=(await interpret(a,m.message_id)).json.command.operation;
  const w=await apply(a,[op],{authorization:command(m.message_id)});
  assertEquals(w.status,200,JSON.stringify(w.json));
  const receipt=w.json.receipt.operation_id;
  const p=await prepare(a,{...op,value:'Ontario',expected_revision:2});
  assertEquals(p.status,200,JSON.stringify(p.json));
  const prior=await sql`select proname,pg_get_functiondef(oid) definition from pg_proc where pronamespace='public'::regnamespace and proname like 'companion_before371_%' order by proname`;
  await sql.begin(async tx=>tx.unsafe(await Deno.readTextFile(PROFILE_DOWN)));
  await waitProfileSchema(false);
  const downRead=await read(a);
  assertEquals([downRead.status,downRead.json.profile],[200,undefined]);
  assertEquals((await a.client.from('user_onboarding_profiles').select('province').single()).data?.province,'Alberta');
  assertEquals((await sql`select to_regprocedure('public.companion_read_profile(uuid)') is null absent`)[0].absent,true);
  for(const row of prior){
    const names:Record<string,string>={validate:'validate_operations',authorization:'check_authorization',apply_one:'apply_one',receipt:'receipt_summary',
      prepare:'prepare_proposal',recheck:'recheck_proposal',cancel:'cancel_proposal',conversation:'conversation_actions',context:'profile_context',undo:'undo_action'};
    const name='companion_'+names[row.proname.slice('companion_before371_'.length)];
    const current=await sql`select pg_get_functiondef(oid) definition from pg_proc where pronamespace='public'::regnamespace and proname=${name}`;
    assertEquals(current[0].definition,row.definition.replaceAll(row.proname,name));
  }
  await a.client.from('user_onboarding_profiles').update({province:'Quebec'}).eq('id',a.id).throwOnError();
  await sql.begin(async tx=>tx.unsafe(await Deno.readTextFile(PROFILE_UP)));
  await readyProfile();
  assertEquals((await read(a)).json.profile.province,'Quebec');
  const recovered=await status(a,receipt);
  assertEquals(recovered.json.status,'applied',JSON.stringify(recovered.json));
  assertEquals(recovered.json.receipt.profile.after,'Alberta');
  assertEquals(recovered.json.receipt.current,false);
  const archived=await sql`select count(*)::int n from companion_rollback_archive_371 where restored_at is null`;
  assertEquals(archived[0].n,0);
} });
