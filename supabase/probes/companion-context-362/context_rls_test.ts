// Companion context reads against a real local stack (ticket #362): real
// GoTrue JWTs for synthetic accounts, real PostgREST, real Postgres row-level
// security with the hosted policies (supabase/migrations/…_hosted_baseline.sql)
// and the real messages.companion_context migration.
//
// The rag-query handler runs in this Deno process. Every request it makes to
// the local stack goes there unchanged; only the external providers are
// controlled fixtures: OpenRouter (embeddings, guidance search, answer),
// published checklist content and the official pages. Nothing here proves
// hosted behaviour or live-source content.
//
// RUN: ./run.sh            (starts the stack on 127.0.0.1:59471-59473)

import { assert, assertEquals } from 'jsr:@std/assert@1';

const realFetch = globalThis.fetch;
const env = (k: string) => {
  const v = Deno.env.get(`PROBE_${k}`);
  if (!v) throw new Error(`PROBE_${k} missing: run via ./run.sh`);
  return v;
};
const API_URL = env('API_URL');
const ANON_KEY = env('ANON_KEY');
const SERVICE_ROLE_KEY = env('SERVICE_ROLE_KEY');
if (!/^http:\/\/(127\.0\.0\.1|localhost):59471$/.test(API_URL)) {
  throw new Error(`probe refuses to run against ${API_URL}`);
}

const { captureServe, fetchLog, json, setRoutes, testEnv } = await import(
  '../../functions/_shared/testHarness.ts'
);
const { embeddingsResponse } = await import('../../functions/_shared/testEmbeddingFixtures.ts');
type FetchCall = import('../../functions/_shared/testHarness.ts').FetchCall;

testEnv.SUPABASE_URL = API_URL;
testEnv.SUPABASE_ANON_KEY = ANON_KEY;
testEnv.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE_KEY;
testEnv.SANITY_PROJECT_ID = 'testproject';
testEnv.SANITY_DATASET = 'production';

const takeHandler = captureServe();
await import('../../functions/rag-query/index.ts');
const handler = takeHandler();

const opts = { sanitizeOps: false, sanitizeResources: false };
const LOCAL = new URL(API_URL).origin;
const SIN_URL = 'https://www.canada.ca/en/employment-social-development/services/sin.html';

// ---------------------------------------------------------------- local stack helpers

async function rest(
  method: string,
  path: string,
  body?: unknown,
  jwt = SERVICE_ROLE_KEY,
  prefer = 'return=representation'
): Promise<{ status: number; json: any }> {
  const res = await realFetch(`${API_URL}${path}`, {
    method,
    headers: {
      apikey: jwt === SERVICE_ROLE_KEY ? SERVICE_ROLE_KEY : ANON_KEY,
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      Prefer: prefer,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: any = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // keep text
  }
  return { status: res.status, json: parsed };
}

interface Account {
  id: string;
  jwt: string;
  email: string;
}

let counter = 0;
async function newAccount(label: string): Promise<Account> {
  const email = `${label}-${Date.now()}-${counter++}@probe.invalid`;
  const password = 'probe-password-1';
  const created = await realFetch(`${API_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true }),
  }).then(r => r.json());
  const session = await realFetch(`${API_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }).then(r => r.json());
  if (!created?.id || !session?.access_token) throw new Error('account setup failed');
  return { id: created.id, jwt: session.access_token, email };
}

function inDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- fixtures

const A = await newAccount('vancouver');
const B = await newAccount('toronto');

async function seed() {
  await rest('POST', '/rest/v1/user_onboarding_profiles', [
    { id: A.id, persona: 'other', city: 'Vancouver', province: 'British Columbia', arrival_date: inDays(6), stage: 0 },
    { id: B.id, persona: 'skilled_worker', city: 'Toronto', province: 'Ontario', arrival_date: '2025-02-01', stage: 2 },
  ]);
  await rest('POST', '/rest/v1/user_tasks', [
    { user_id: A.id, sanity_checklist_id: 'checklist-bank', completed: false },
    { user_id: B.id, sanity_checklist_id: 'checklist-credit', completed: true },
  ]);
  await rest('POST', '/rest/v1/custom_checklist_tasks', [
    { user_id: A.id, priority: 'Do now', title: 'Find a family doctor' },
    { user_id: B.id, priority: 'Do now', title: 'B private task title' },
  ]);
  const conv = await rest('POST', '/rest/v1/conversations', [
    { user_id: A.id, title: 'A' },
    { user_id: B.id, title: 'B' },
  ]);
  const [convA, convB] = conv.json as Array<{ id: number; conversation_identifier: string }>;
  await rest('POST', '/rest/v1/messages', [
    { conversation_id: convB.id, role: 'user', content: 'B private message' },
  ]);
  return { convA, convB };
}
const { convA, convB } = await seed();

const CONTENT: Record<string, unknown[]> = {
  '"not_arrived"': [
    { _id: 'checklist-sin', _rev: 'rev-sin-3', title: 'Get your SIN' },
    { _id: 'checklist-bank', _rev: 'rev-bank-1', title: 'Open a bank account' },
  ],
  '"months_3_12"': [{ _id: 'checklist-credit', _rev: 'rev-credit-2', title: 'Build your credit history' }],
};

async function passthrough(call: FetchCall): Promise<Response> {
  const body =
    call.method === 'GET' || call.method === 'HEAD' || call.body === undefined
      ? undefined
      : typeof call.body === 'string'
        ? call.body
        : JSON.stringify(call.body);
  return await realFetch(call.url, { method: call.method, headers: call.headers, body });
}

function routes(call: FetchCall): Response | undefined {
  if (call.url.origin === LOCAL) return passthrough(call) as unknown as Response;
  if (call.url.hostname === 'testproject.apicdn.sanity.io') {
    return json({ result: CONTENT[call.url.searchParams.get('$stage') ?? ''] ?? [] });
  }
  if (call.url.hostname === 'openrouter.ai') {
    if (call.url.pathname.endsWith('/embeddings')) {
      return embeddingsResponse((call.body as { input: unknown[] }).input.length);
    }
    if ((call.body as { plugins?: unknown }).plugins) {
      return json({ choices: [{ message: { content: SIN_URL } }] });
    }
    return json({
      choices: [{ message: { content: 'Answer.\n[TOPIC]: settling_in' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      model: 'test/model',
      provider: 'TestProvider',
    });
  }
  if (call.url.href === SIN_URL) {
    return new Response('<html><title>SIN</title><main><p>Apply for a SIN.</p></main></html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
  }
  if (call.url.hostname.endsWith('posthog.com')) return json({ status: 1 });
  return undefined;
}

function req(who: Account | { jwt: string }, prompt: string, extra: Record<string, unknown> = {}): Request {
  return new Request('http://localhost/rag-query', {
    method: 'POST',
    headers: { Authorization: `Bearer ${who.jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, messages: [], ...extra }),
  });
}

async function ask(who: Account | { jwt: string }, prompt: string, extra: Record<string, unknown> = {}) {
  setRoutes(routes);
  const res = await handler(req(who, prompt, extra));
  const body = await res.json();
  const calls = [...fetchLog];
  const answer = calls.find(
    c => c.url.pathname.endsWith('/chat/completions') && !(c.body as { plugins?: unknown }).plugins
  );
  return { status: res.status, body, context: body.context as Record<string, any>, answer, calls };
}

const tasksOf = (context: Record<string, any>) =>
  (context.items as Array<Record<string, any>>)
    .filter(i => i.kind === 'checklist_task')
    .map(i => `${i.id}|${i.title}|${i.state}`);

const QUESTION = 'I arrive in Vancouver next week. What should I do first?';

// ---------------------------------------------------------------- tests

Deno.test({
  ...opts,
  name: 'real RLS: each account reads only its own profile and Checklist, whatever userId the body claims',
  fn: async () => {
    const a = await ask(A, QUESTION, { conversationIdentifier: convA.conversation_identifier, userId: B.id });
    assertEquals(a.status, 200);
    const aTasks = tasksOf(a.context);
    assertEquals(aTasks[0], 'sanity:checklist-sin|Get your SIN|not_started');
    assertEquals(aTasks[1].startsWith('sanity:checklist-bank|Open a bank account|not_started'), true);
    assertEquals(aTasks.length, 3);
    assert(aTasks[2].startsWith('custom:') && aTasks[2].includes('Find a family doctor'));
    const everything = JSON.stringify({ context: a.context, answer: a.answer?.body });
    assert(!everything.includes('B private'), 'nothing of account B reaches A');
    const profile = (a.context.items as Array<Record<string, any>>).find(i => i.kind === 'profile');
    assertEquals(profile?.fields.find((f: Record<string, string>) => f.key === 'province').value, 'British Columbia');

    const b = await ask(B, 'What should I do first to build credit?', {
      conversationIdentifier: convB.conversation_identifier,
    });
    const bTasks = tasksOf(b.context);
    assertEquals(bTasks.length, 2);
    assert(/^custom:\d+\|B private task title\|not_started$/.test(bTasks[0]), bTasks[0]);
    assertEquals(bTasks[1], 'sanity:checklist-credit|Build your credit history|completed');
    assert(!JSON.stringify(b.context).includes('Find a family doctor'));
  },
});

Deno.test({
  ...opts,
  name: "real RLS: another account's conversation id is denied and its history is not used",
  fn: async () => {
    const a = await ask(A, QUESTION, {
      conversationIdentifier: convB.conversation_identifier,
      messages: [{ role: 'user', message: 'turn sent with the foreign conversation' }],
    });
    assertEquals(a.status, 200);
    assertEquals(
      a.context.reads.find((r: Record<string, string>) => r.capability === 'context.conversation').status,
      'denied'
    );
    assert(!a.context.items.some((i: Record<string, unknown>) => i.kind === 'conversation'));
    const sent = JSON.stringify((a.answer?.body as { messages: unknown }).messages);
    assert(!sent.includes('turn sent with the foreign conversation'));
    assert(!sent.includes('B private message'));
  },
});

Deno.test({
  ...opts,
  name: 'real RLS: a conversation deleted on another device is denied on the next answer',
  fn: async () => {
    const created = await rest('POST', '/rest/v1/conversations', [{ user_id: A.id, title: 'temp' }], A.jwt);
    assertEquals(created.status, 201);
    const id = created.json[0].conversation_identifier;
    const before = await ask(A, QUESTION, { conversationIdentifier: id });
    assertEquals(before.context.items.find((i: Record<string, unknown>) => i.kind === 'conversation')?.id, id);
    const deleted = await rest('DELETE', `/rest/v1/conversations?conversation_identifier=eq.${id}`, undefined, A.jwt);
    assertEquals(deleted.status, 200);
    const after = await ask(A, QUESTION, { conversationIdentifier: id });
    assertEquals(
      after.context.reads.find((r: Record<string, string>) => r.capability === 'context.conversation').status,
      'denied'
    );
  },
});

Deno.test({
  ...opts,
  name: 'real auth: a deleted account and a signed-out session get 401 before any context read',
  fn: async () => {
    const gone = await newAccount('gone');
    const del = await realFetch(`${API_URL}/auth/v1/admin/users/${gone.id}`, {
      method: 'DELETE',
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
    });
    await del.body?.cancel();
    const deletedRes = await ask(gone, QUESTION);
    assertEquals(deletedRes.status, 401);

    const leaving = await newAccount('leaving');
    const out = await realFetch(`${API_URL}/auth/v1/logout?scope=global`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${leaving.jwt}` },
    });
    await out.body?.cancel();
    const signedOut = await ask(leaving, QUESTION);
    assertEquals(signedOut.status, 401);
    for (const res of [deletedRes, signedOut]) {
      assert(!res.calls.some(c => /\/rest\/v1\/(user_onboarding_profiles|user_tasks|custom_checklist_tasks|conversations)/.test(c.url.pathname)));
    }
  },
});

Deno.test({
  ...opts,
  name: 'real RLS: simultaneous requests from two accounts stay isolated',
  fn: async () => {
    setRoutes(routes);
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        handler(
          req(i % 2 === 0 ? A : B, i % 2 === 0 ? QUESTION : 'What should I do first to build credit?', {
            conversationIdentifier: (i % 2 === 0 ? convA : convB).conversation_identifier,
            ...(i === 0 ? { stream: true } : {}),
          })
        )
      )
    );
    for (const [i, res] of results.entries()) {
      assertEquals(res.status, 200);
      let context: Record<string, any>;
      if (i === 0) {
        const meta = (await res.text()).split('\n\n').find(b => b.startsWith('event: metadata'))!;
        context = JSON.parse(meta.split('\n')[1].slice(6)).context;
      } else {
        context = (await res.json()).context;
      }
      const text = JSON.stringify(context);
      if (i % 2 === 0) {
        assert(text.includes('Find a family doctor') && !text.includes('B private'), `request ${i} is A's`);
        assertEquals(context.items.find((c: Record<string, unknown>) => c.kind === 'conversation').id, convA.conversation_identifier);
      } else {
        assert(text.includes('B private task title') && !text.includes('Find a family doctor'), `request ${i} is B's`);
        assertEquals(context.items.find((c: Record<string, unknown>) => c.kind === 'conversation').id, convB.conversation_identifier);
      }
    }
  },
});

Deno.test({
  ...opts,
  name: 'real database: answering with stated details writes nothing to the profile, tasks or messages',
  fn: async () => {
    const snapshot = async () => {
      const tables = ['user_onboarding_profiles', 'user_tasks', 'custom_checklist_tasks', 'messages', 'conversations'];
      const rows = await Promise.all(tables.map(t => rest('GET', `/rest/v1/${t}?select=*`)));
      rows.forEach((r, i) => {
        assertEquals(r.status, 200, tables[i]);
        assert(Array.isArray(r.json) && r.json.length > 0, `${tables[i]} has rows to compare`);
      });
      return JSON.stringify(rows.map(r => (r.json as unknown[]).map(row => JSON.stringify(row)).sort()));
    };
    const before = await snapshot();
    const res = await ask(A, 'I am moving to Toronto in 2 weeks, remember that. What should I do first?', {
      conversationIdentifier: convA.conversation_identifier,
    });
    assertEquals(res.status, 200);
    assertEquals(res.context.clarification?.kind, 'profile_conflict');
    const after = await snapshot();
    assertEquals(after, before);
  },
});

Deno.test({
  ...opts,
  name: 'real migration: companion_context saves with the owner, stays private, rejects other shapes, and old clients are unaffected',
  fn: async () => {
    const { context } = await ask(A, QUESTION, { conversationIdentifier: convA.conversation_identifier });
    const saved = await rest(
      'POST',
      '/rest/v1/messages',
      { conversation_id: convA.id, role: 'assistant', content: 'Answer.', sources: null, companion_context: context },
      A.jwt
    );
    assertEquals(saved.status, 201);
    const id = saved.json[0].id;

    const own = await rest('GET', `/rest/v1/messages?select=id,companion_context&id=eq.${id}`, undefined, A.jwt);
    assertEquals(own.json[0].companion_context.version, 1);
    assertEquals(own.json[0].companion_context.guidance.sources[0].url, SIN_URL);

    const other = await rest('GET', `/rest/v1/messages?select=id,companion_context&id=eq.${id}`, undefined, B.jwt);
    assertEquals(other.json, []);
    const foreign = await rest(
      'POST',
      '/rest/v1/messages',
      { conversation_id: convA.id, role: 'assistant', content: 'x', companion_context: context },
      B.jwt
    );
    assertEquals(foreign.status, 403);

    const badShape = await rest(
      'POST',
      '/rest/v1/messages',
      { conversation_id: convA.id, role: 'assistant', content: 'x', companion_context: { version: 2 } },
      A.jwt
    );
    assertEquals(badShape.status, 400);
    const notObject = await rest(
      'POST',
      '/rest/v1/messages',
      { conversation_id: convA.id, role: 'assistant', content: 'x', companion_context: ['x'] },
      A.jwt
    );
    assertEquals(notObject.status, 400);

    // An older client's insert and select (no companion_context) still work.
    const legacy = await rest(
      'POST',
      '/rest/v1/messages',
      { conversation_id: convA.id, role: 'assistant', content: 'legacy', sources: [{ document_id: 1, document_title: 'T', url: 'https://www.canada.ca/' }] },
      A.jwt
    );
    assertEquals(legacy.status, 201);
    const legacyRead = await rest(
      'GET',
      `/rest/v1/messages?select=id,role,content,sources,created_at,conversations!inner(conversation_identifier,user_id)&conversations.conversation_identifier=eq.${convA.conversation_identifier}`,
      undefined,
      A.jwt
    );
    assertEquals(legacyRead.status, 200);
    assert(legacyRead.json.some((m: Record<string, unknown>) => m.content === 'legacy'));
  },
});
