// Real local JWTs, service handler and Postgres. Only provider/content/analytics are controlled.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { API_URL, ANON_KEY, SERVICE_ROLE_KEY, sql, newAccount, read, apply, setState, taskOf, status, undo, testOpts, startContentStub, sleep } from './support.ts';
import { embeddingsResponse } from '../../functions/_shared/testEmbeddingFixtures.ts';
import { readyProfile } from './profileSupport.ts';
const migration = new URL('../../migrations/20261101024721_companion_allowance_and_cohort.sql', import.meta.url);
await readyProfile();
await sql.unsafe('alter table public.users add column if not exists is_premium boolean default false');
await sql.unsafe(await Deno.readTextFile(new URL('./fixtures/chatbot-usage-policy.sql', import.meta.url)));
await sql.unsafe(await Deno.readTextFile(new URL('./fixtures/chatbot-usage-permissions.sql', import.meta.url)));
if (!(await sql`select to_regprocedure('public.get_chatbot_allowance()') is not null present`)[0].present) await sql.begin(async tx => tx.unsafe((await Deno.readTextFile(migration)).replace(/^begin;$/gm,'').replace(/^commit;$/gm,'')));
for (let i = 0; i < 100; i++) {
  const schema = await fetch(API_URL + '/rest/v1/', { headers: { apikey: SERVICE_ROLE_KEY, authorization: 'Bearer ' + SERVICE_ROLE_KEY } });
  if ('/rpc/get_chatbot_allowance' in ((await schema.json()).paths ?? {})) break;
  await sleep(50);
}
startContentStub();
const a = await newAccount('allowance-a');
const b = await newAccount('allowance-b');
const headers = (jwt: string) => ({ apikey: ANON_KEY, authorization: 'Bearer ' + jwt, 'content-type': 'application/json' });
async function allowance(jwt = a.jwt, body: unknown = {}) {
  const r = await fetch(API_URL + '/rest/v1/rpc/get_chatbot_allowance', { method: 'POST', headers: headers(jwt), body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
}
async function seed(count: number, premium = false, yesterday = false) {
  await sql`update public.users set is_premium=${premium} where id=${a.id}`;
  await sql`insert into public.chatbot_usage(user_id,message_count,last_message_at) values(${a.id},${count},now()-${yesterday ? '1 day' : '0 days'}::interval)
    on conflict(user_id) do update set message_count=excluded.message_count,last_message_at=excluded.last_message_at`;
}
// Capture the real HTTP handler without opening a listener. Authentication is unchanged.
const realFetch = globalThis.fetch;
let handler!: (req: Request) => Promise<Response>;
const realServe = Deno.serve;
const serveCapture = Deno as unknown as { serve: (fn: typeof handler) => unknown };
serveCapture.serve = (fn: typeof handler) => { handler = fn; return {}; };
Deno.env.set('SUPABASE_URL', API_URL);
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', SERVICE_ROLE_KEY);
Deno.env.set('SUPABASE_ANON_KEY', ANON_KEY);
Deno.env.set('OPENROUTER_API_KEY', 'controlled-local-provider');
Deno.env.delete('RAG_EVAL_TOKEN');
Deno.env.delete('POSTHOG_PROJECT_API_KEY');
await import('../../functions/rag-query/index.ts');
serveCapture.serve = realServe;
let generations = 0;
let fail = false;
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.origin === API_URL && url.pathname.endsWith('/rpc/match_chunks')) return Response.json([]);
  if (url.origin === API_URL || url.hostname === '127.0.0.1') return realFetch(input, init);
  if (url.hostname === 'openrouter.ai' && url.pathname.endsWith('/embeddings')) return embeddingsResponse(1);
  if (url.hostname === 'openrouter.ai' && url.pathname.endsWith('/chat/completions')) {
    generations++;
    return new Response(JSON.stringify(fail ? { error: { message: 'controlled failure' } } : {
      choices: [{ message: { content: 'Synthetic answer.\n[TOPIC]: other' }, finish_reason: 'stop' }],
      model: 'controlled/model', provider: 'Controlled', usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cost: 0.0001 },
    }), { status: fail ? 400 : 200, headers: { 'content-type': 'application/json' } });
  }
  return new Response('{}', { status: 599 });
};
async function ask(jwt = a.jwt, prompt = 'Hello') {
  const response = await handler(new Request(API_URL + '/functions/v1/rag-query', { method: 'POST', headers: headers(jwt), body: JSON.stringify({ prompt, platform: 'web' }) }));
  return { status: response.status, body: await response.json() };
}
Deno.test({ name: 'allowance read derives ownership from a real JWT and denies mutation RPCs', ...testOpts, fn: async () => {
  assertEquals((await allowance(ANON_KEY)).status, 401);
  assertEquals((await allowance('forged')).status, 401);
  await seed(5);
  assertEquals((await allowance()).body.remaining, 1);
  assertEquals((await allowance(b.jwt)).body.remaining, 6);
  assertEquals((await allowance(b.jwt, { p_user_id: a.id })).status, 404);
  for (const [fn, args] of [['check_and_increment_chatbot_usage', { p_user_id: a.id, p_daily_limit: 6 }], ['refund_chatbot_message', { p_user_id: a.id }], ['increment_chatbot_usage', { p_user_id: a.id, p_tokens: 1, p_cost: 0 }]] as const) {
    assert((await a.client.rpc(fn, args)).error, fn);
  }
}});
Deno.test({ name: 'concurrent authenticated generation at five permits exactly one sixth message', ...testOpts, fn: async () => {
  await seed(5); generations = 0;
  const replies = await Promise.all([ask(), ask(), ask(), ask()]);
  assertEquals(replies.map(r => r.status).sort(), [200,429,429,429]);
  assertEquals(generations, 1);
  assertEquals((await allowance()).body.remaining, 0);
  assertEquals((await allowance()).body.message_count, 6);
  console.log(JSON.stringify({ controlled: true, statuses: replies.map(r => r.status), generation_count: generations, provider_cost_measured: null }));
}});
Deno.test({ name: 'failed generation refunds its existing slot and old RPC signatures still work', ...testOpts, fn: async () => {
  await seed(5); fail = true;
  assertEquals((await ask()).status, 500);
  fail = false;
  assertEquals((await allowance()).body.remaining, 1);
  const service = await realFetch(API_URL+'/rest/v1/rpc/check_and_increment_chatbot_usage', { method: 'POST', headers: { ...headers(SERVICE_ROLE_KEY), apikey: SERVICE_ROLE_KEY }, body: JSON.stringify({ p_user_id: a.id, p_daily_limit: 6 }) });
  assertEquals(await service.json(), true);
  assertEquals((await allowance()).body.message_count, 6);
}});
Deno.test({ name: 'UTC reset is server derived and premium retains uncapped generation', ...testOpts, fn: async () => {
  await seed(6, false, true);
  const r = (await allowance()).body;
  assertEquals([r.daily_limit,r.message_count,r.remaining,r.is_premium], [6,0,6,false]);
  assertEquals(new Date(r.resets_at).toISOString().slice(11), '00:00:00.000Z');
  const interval = Date.parse(r.resets_at)-Date.parse(r.observed_at);
  assert(interval > 0 && interval <= 86400000);
  await seed(20, true);
  assertEquals((await ask()).status, 200);
  const p = (await allowance()).body;
  assertEquals([p.remaining,p.is_premium,p.message_count], [null,true,21]);
}});
Deno.test({ name: 'exhausted generation keeps action, receipt lookup and Undo available in the account cohort', ...testOpts, fn: async () => {
  await seed(6); generations = 0;
  await sql`update public.companion_feature_gate set enabled=false,account_allowlist=array[${a.id}::uuid]`;
  assertEquals((await read(a)).status, 200);
  assertEquals((await read(b)).status, 403);
  const applied = await apply(a, [setState('sanity:bank-account','in_progress',0)]);
  assertEquals(applied.status, 200);
  assertEquals((await taskOf(a,'sanity:bank-account')).state,'in_progress');
  assertEquals((await status(a,applied.json.operation_id)).status,200);
  assertEquals((await undo(a,applied.json.operation_id)).status,200);
  assertEquals((await taskOf(a,'sanity:bank-account')).state,'not_started');
  assertEquals((await allowance()).body.message_count,6);
  assertEquals(generations,0);
  const legacy = await ask(b.jwt);
  assertEquals(legacy.status,200);
  assertEquals(legacy.body.context,undefined);
  assertEquals(legacy.body.actionProposal,undefined);
  await sql`update public.companion_feature_gate set enabled=true,account_allowlist='{}'`;
}});
Deno.test({ name: 'four synthetic session measurements distinguish controlled cost from provider cost', ...testOpts, fn: async () => {
  for (const [session,prompt] of [['planning','I arrive in Vancouver next week. What should I do first?'],['task_help','What steps do I need to get a Social Insurance Number in Vancouver?']]) {
    await seed(0); generations=0; const start=performance.now();
    const response=await ask(a.jwt,prompt);
    assertEquals(response.status,200); assertEquals(generations,session==='planning'?2:1);
    assertEquals(response.body.generationCount,generations);
    console.log(JSON.stringify({session,proof:'local_controlled',generation_count:generations,
      resolved_model:response.body.model,model_tier:'controlled',reasoning_effort:response.body.reasoningEffort,
      request_frequency:'one turn per session',scope:'one answer, no approval',latency_ms:Math.round(performance.now()-start),
      controlled_cost_usd:response.body.estimatedCostUsd,measured_provider_cost_usd:null}));
  }
  await seed(6); generations=0; const start=performance.now();
  const applied=await apply(a,[setState('sanity:bank-account','in_progress', (await taskOf(a,'sanity:bank-account')).revision)]);
  assertEquals(applied.status,200);
  console.log(JSON.stringify({session:'deterministic_edit',proof:'local_controlled',generation_count:generations,resolved_model:null,model_tier:null,reasoning_effort:null,request_frequency:'one authorized action',scope:'one task state',latency_ms:Math.round(performance.now()-start),measured_provider_cost_usd:null}));
  const recoveryStart=performance.now();
  assertEquals((await status(a,applied.json.operation_id)).status,200);
  assertEquals((await undo(a,applied.json.operation_id)).status,200);
  assertEquals(generations,0);
  console.log(JSON.stringify({session:'recovery',proof:'local_controlled',generation_count:generations,resolved_model:null,model_tier:null,reasoning_effort:null,request_frequency:'one lookup, one Undo',scope:'one receipt',latency_ms:Math.round(performance.now()-recoveryStart),measured_provider_cost_usd:null}));
}});
Deno.test({ name: 'measurement driver completes all four sessions through Auth and owned local persistence', ...testOpts, fn: async () => {
  await seed(0); generations=0;
  const proxy=Deno.serve({hostname:'127.0.0.1',port:0,onListen:()=>{}}, async req => {
    const url=new URL(req.url);
    if (url.pathname==='/functions/v1/rag-query') return handler(req);
    return realFetch(API_URL+url.pathname+url.search,{method:req.method,headers:req.headers,
      body:['GET','HEAD'].includes(req.method)?undefined:await req.arrayBuffer()});
  });
  const file=Deno.env.get('ACTIONS_MEASUREMENT_OUTPUT');
  assert(file,'ACTIONS_MEASUREMENT_OUTPUT must name an owned temporary file');
  try {
    const result=await new Deno.Command('python3',{args:['scripts/measure-companion-sessions.py','--output',file,'--local-controlled','--model-tier-label','controlled'],
      env:{COMPANION_API_URL:'http://127.0.0.1:'+proxy.addr.port,COMPANION_ANON_KEY:ANON_KEY,
        COMPANION_ACCESS_TOKEN:a.jwt,COMPANION_SYNTHETIC_USER_ID:a.id},stdout:'piped',stderr:'piped'}).output();
    assertEquals(result.code,0,new TextDecoder().decode(result.stderr));
    const measured=JSON.parse(await Deno.readTextFile(file));
    assertEquals(measured.sessions.map((s:{generation_requests:number})=>s.generation_requests),[2,1,0,0]);
    assertEquals(measured.sessions.map((s:{measured_provider_cost_usd:unknown})=>s.measured_provider_cost_usd),[null,null,null,null]);
    assertEquals(generations,3);
  } finally { await proxy.shutdown(); }
}});
Deno.test({ name: 'new migration rollback preserves the deployed RPC contract', ...testOpts, fn: async () => {
  await sql.begin(async tx => tx.unsafe((await Deno.readTextFile(new URL('../../rollbacks/20261101024721_companion_allowance_and_cohort.down.sql',import.meta.url))).replace(/^begin;$/gm,'').replace(/^commit;$/gm,'')));
  const [r] = await sql`select to_regprocedure('public.get_chatbot_allowance()') is null absent, to_regprocedure('public.check_and_increment_chatbot_usage(uuid,integer)') is not null legacy`;
  assertEquals([r.absent,r.legacy],[true,true]);
  if (!(await sql`select to_regprocedure('public.get_chatbot_allowance()') is not null present`)[0].present) await sql.begin(async tx => tx.unsafe((await Deno.readTextFile(migration)).replace(/^begin;$/gm,'').replace(/^commit;$/gm,'')));
}});
Deno.test({ name: 'cleanup allowance controlled runtime', ...testOpts, fn: async () => { globalThis.fetch = realFetch; await sql.end(); } });
