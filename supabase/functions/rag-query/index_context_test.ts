// rag-query handler: profile plus retrieved chunks to the model request (spec
// UnifyCN/web-app#177, ticket #181). Runs the real Deno.serve handler; only the
// network is stubbed (_shared/testHarness.ts). Each test reads what the handler
// sent to match_chunks and to the answer model, and what it returned.
//
// RUN (from web-app/):
//   deno test --no-check --node-modules-dir=auto supabase/functions/rag-query/index_context_test.ts

import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import {
  captureServe,
  fetchLog,
  json,
  setRoutes,
  supabaseRoute,
  type FetchCall,
} from '../_shared/testHarness.ts';
import { embeddingsResponse, storedVector } from '../_shared/testEmbeddingFixtures.ts';

const takeHandler = captureServe();
await import('./index.ts');
const handler = takeHandler();

const NEWS = 'https://www.canada.ca/en/immigration-refugees-citizenship/news.html';
const OINP = 'https://www.ontario.ca/page/ontario-immigrant-nominee-program-oinp';

function row(
  id: number,
  documentId: number,
  text: string,
  doc: Record<string, unknown>
) {
  return {
    id,
    document_id: documentId,
    chunk_index: id,
    chunk_text: text,
    similarity: 0.8,
    knowledge_documents: {
      id: documentId,
      title: `Doc ${documentId}`,
      storage_path: null,
      subject: 'pr',
      section: null,
      source_url: null,
      updated_at: '2026-10-01T00:00:00Z',
      published_at: null,
      fetched_at: null,
      chunk_source_url: null,
      ...doc,
    },
  };
}

const KB_CHUNKS = [
  row(1, 7, 'Express Entry draw #450 on 2026-10-14: minimum CRS 520.', {
    title: 'Express Entry Rounds',
    source_url: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/rounds-invitations.html',
    published_at: '2026-10-14',
  }),
  row(2, 7, 'Express Entry draw #449 on 2026-09-30: minimum CRS 535.', {
    title: 'Express Entry Rounds',
    source_url: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/rounds-invitations.html',
    published_at: '2026-09-30',
  }),
  row(3, 9, '2026-10-16: Canada refocusing Express Entry.', {
    title: 'IRCC Newsroom',
    source_url: NEWS,
    chunk_source_url: 'https://www.canada.ca/en/immigration-refugees-citizenship/news/2026/10/refocusing.html',
    published_at: '2026-10-16',
  }),
  row(4, 9, '2026-10-09: Study permit changes.', {
    title: 'IRCC Newsroom',
    source_url: NEWS,
    chunk_source_url: 'https://www.canada.ca/en/immigration-refugees-citizenship/news/2026/10/study.html',
    fetched_at: '2026-10-10T06:00:00Z',
  }),
  row(5, 12, 'OINP streams overview.', { title: 'OINP', source_url: OINP }),
];

let profile: Record<string, unknown> | null = null;
let chunks: unknown[] = KB_CHUNKS;
/** How long the stubbed profile read takes, so a missing await shows up. */
const PROFILE_DELAY_MS = 40;

function routes(call: FetchCall): Response | undefined {
  const supabase = supabaseRoute(call, {
    userId: 'user-1',
    rpc: { check_and_increment_chatbot_usage: true, match_chunks: chunks },
    tables: { user_onboarding_profiles: profile ? [profile] : [] },
  });
  if (supabase && call.url.pathname === '/rest/v1/user_onboarding_profiles') {
    // The harness awaits whatever the route returns.
    return new Promise(resolve =>
      setTimeout(() => resolve(supabase), PROFILE_DELAY_MS)
    ) as unknown as Response;
  }
  if (supabase) return supabase;
  if (call.url.hostname === 'openrouter.ai') {
    if (call.url.pathname.endsWith('/embeddings')) {
      return embeddingsResponse((call.body as { input: unknown[] }).input.length);
    }
    if (call.url.pathname.endsWith('/chat/completions')) {
      return json({
        choices: [{ message: { content: 'Answer.\n[SUGGESTIONS]: A? | B?\n[TOPIC]: immigration' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cost: 0.0001 },
        model: 'test/model',
        provider: 'TestProvider',
      });
    }
  }
  if (call.url.hostname.endsWith('posthog.com')) return json({ status: 1 });
  return undefined;
}

async function ask(prompt: string) {
  setRoutes(routes);
  const res = await handler(
    new Request('http://localhost/rag-query', {
      method: 'POST',
      headers: { Authorization: 'Bearer user-jwt', 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationIdentifier: 'conv-1', prompt }),
    })
  );
  const payload = await res.json();
  const calls = [...fetchLog];
  const rpc = calls.find(c => c.url.pathname === '/rest/v1/rpc/match_chunks');
  const chat = calls.find(c => c.url.pathname.endsWith('/chat/completions'));
  const embedding = calls.find(c => c.url.pathname.endsWith('/embeddings'));
  const system = (
    (chat?.body as { messages: Array<{ role: string; content: string }> } | undefined)?.messages ?? []
  ).find(m => m.role === 'system')?.content ?? '';
  return { status: res.status, payload, calls, rpc, chat, embedding, system };
}

const opts = { sanitizeOps: false, sanitizeResources: false };

const ONTARIO_WORKER = {
  id: 'user-1',
  persona: 'skilled_worker',
  city: 'Toronto',
  province: 'ON',
  arrival_date: '2099-01-15',
  goals: ['get_pr'],
  learning_interests: ['banking_basics'],
};

Deno.test({
  ...opts,
  name: 'retrieval: an Ontario profile sends all five arguments, with threshold 0.3 and count 10',
  fn: async () => {
    profile = ONTARIO_WORKER;
    chunks = KB_CHUNKS;
    const { status, rpc } = await ask('What is the latest Express Entry cutoff?');
    assertEquals(status, 200);
    assertEquals(rpc?.body, {
      query_embedding: storedVector(0),
      match_threshold: 0.3,
      match_count: 10,
      filter_province: 'Ontario',
      query_embedding_model: 'qwen/qwen3-embedding-8b',
    });
  },
});

Deno.test({
  ...opts,
  name: 'retrieval: a slow in-flight profile is awaited, so its province still filters',
  fn: async () => {
    profile = { ...ONTARIO_WORKER, province: 'British Columbia' };
    const { rpc } = await ask('What is the latest Express Entry cutoff?');
    assertEquals((rpc?.body as Record<string, unknown>).filter_province, 'British Columbia');
  },
});

Deno.test({
  ...opts,
  name: 'retrieval: no profile row, a null province or an unmatched province send an explicit null',
  fn: async () => {
    for (const row of [null, { id: 'user-1', persona: 'refugee' }, { id: 'user-1', province: 'Atlantis' }]) {
      profile = row;
      const { rpc } = await ask('What is the latest Express Entry cutoff?');
      const body = rpc?.body as Record<string, unknown>;
      assertEquals('filter_province' in body, true, JSON.stringify(row));
      assertEquals(body.filter_province, null, JSON.stringify(row));
    }
  },
});

Deno.test({
  ...opts,
  name: 'retrieval: the query vector is built from the raw question only',
  fn: async () => {
    profile = ONTARIO_WORKER;
    const { embedding } = await ask('What is the latest Express Entry cutoff?');
    assertEquals((embedding?.body as { input: string[] }).input, ['What is the latest Express Entry cutoff?']);
  },
});

Deno.test({
  ...opts,
  name: 'model context: each chunk carries its own date, and profile personalisation is kept',
  fn: async () => {
    profile = ONTARIO_WORKER;
    chunks = KB_CHUNKS;
    const { system } = await ask('What is the latest Express Entry cutoff?');
    assertStringIncludes(
      system,
      '[Document: Express Entry Rounds] (as of October 14, 2026)\nExpress Entry draw #450 on 2026-10-14: minimum CRS 520.'
    );
    assertStringIncludes(
      system,
      '[Document: Express Entry Rounds] (as of September 30, 2026)\nExpress Entry draw #449 on 2026-09-30: minimum CRS 535.'
    );
    assertStringIncludes(system, '[Document: IRCC Newsroom] (as of October 10, 2026)\n2026-10-09: Study permit changes.');
    assertStringIncludes(system, '[Document: OINP] (source date unknown)\nOINP streams overview.');
    // persona, location, goals and interests still reach the answer prompt
    assertStringIncludes(system, 'USER PROFILE CONTEXT');
    assertStringIncludes(system, 'You are speaking with a skilled worker who plans to arrive in Toronto on January 15, 2099.');
    assertStringIncludes(system, 'Their goals: get pr.');
    assertStringIncludes(system, 'Their interests: banking basics.');
    // the Ontario pointer is present
    assertStringIncludes(system, OINP);
  },
});

Deno.test({
  ...opts,
  name: 'citations: same-document news items keep their own addresses; the response shape is unchanged',
  fn: async () => {
    profile = ONTARIO_WORKER;
    chunks = KB_CHUNKS;
    const { payload } = await ask('What is the latest Express Entry cutoff?');
    assertEquals(
      payload.sources.map((s: Record<string, unknown>) => [s.document_id, s.url]),
      [
        [7, 'https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/rounds-invitations.html'],
        [9, 'https://www.canada.ca/en/immigration-refugees-citizenship/news/2026/10/refocusing.html'],
        [9, 'https://www.canada.ca/en/immigration-refugees-citizenship/news/2026/10/study.html'],
        [12, OINP],
      ]
    );
    for (const source of payload.sources) {
      assertEquals(Object.keys(source).sort(), ['document_id', 'document_title', 'url']);
    }
    assertEquals(payload.lastVerified, '2026-10-01T00:00:00Z');
  },
});

Deno.test({
  ...opts,
  name: 'pointers: a region without a nominee source gets its own page; no province gets none',
  fn: async () => {
    profile = { id: 'user-1', persona: 'refugee', province: 'MB' };
    const manitoba = await ask('How do I apply for a provincial nominee program?');
    assertEquals((manitoba.rpc?.body as Record<string, unknown>).filter_province, 'Manitoba');
    assertStringIncludes(manitoba.system, 'no Manitoba nominee program source');
    assertStringIncludes(manitoba.system, 'https://immigratemanitoba.com/');
    assert(!manitoba.system.includes(OINP));

    profile = { id: 'user-1', persona: 'refugee', province: null };
    const none = await ask('How do I apply for a provincial nominee program?');
    assert(!none.system.includes('PROVINCE IMMIGRATION POINTER'), 'no pointer without a province');
  },
});

const RULES = [
  'as of',
  'current data is not available',
  'from memory',
];

Deno.test({
  ...opts,
  name: 'rules: with knowledge base context, the as-of and no-current-data rules are in the prompt',
  fn: async () => {
    profile = ONTARIO_WORKER;
    chunks = KB_CHUNKS;
    const { system } = await ask('What is the latest Express Entry cutoff?');
    for (const phrase of RULES) assertStringIncludes(system, phrase);
    for (const topic of ['cutoffs', 'processing times', 'fees', 'deadlines', 'program openings']) {
      assertStringIncludes(system, topic);
    }
  },
});

Deno.test({
  ...opts,
  name: 'rules: with no knowledge base hits, the prompt still bans a current number from memory',
  fn: async () => {
    profile = ONTARIO_WORKER;
    chunks = [];
    const { system } = await ask('What is the latest Express Entry cutoff?');
    assert(!system.includes('CONTEXT FROM KNOWLEDGE BASE'), 'this is the no-KB prompt');
    for (const phrase of RULES) assertStringIncludes(system, phrase);
  },
});

Deno.test({
  ...opts,
  name: 'rules: fact-check and form-help prompts carry the rules with and without context',
  fn: async () => {
    profile = ONTARIO_WORKER;
    for (const prompt of [
      'Is it true that the PGWP fee is 255 dollars?',
      'How do I fill out IMM 5710 and what is the fee?',
    ]) {
      for (const rows of [KB_CHUNKS, []]) {
        chunks = rows;
        const { system } = await ask(prompt);
        for (const phrase of RULES) assertStringIncludes(system, phrase);
      }
    }
  },
});

Deno.test({
  ...opts,
  name: 'rules: the general lane does not hand out current immigration numbers either',
  fn: async () => {
    profile = ONTARIO_WORKER;
    chunks = [];
    const { system, rpc } = await ask('hello');
    assertEquals(rpc, undefined, 'no retrieval on the general lane');
    assertStringIncludes(system, 'current data is not available');
    assertStringIncludes(system, 'from memory');
  },
});

function profileBlock(system: string): string {
  return system.split('USER PROFILE CONTEXT:')[1]?.split('PROVINCE IMMIGRATION POINTER:')[0] ?? '';
}

const ALIASES = [
  'ab', 'bc', 'mb', 'nb', 'nl', 'nfld', 'newfoundland', 'nt', 'nwt', 'ns', 'nu', 'on',
  'ont', 'pe', 'pei', 'qc', 'pq', 'québec', 'sk', 'sask', 'yt', 'yukon', 'yukon territory',
];
const REGIONS = [
  'Alberta', 'British Columbia', 'Manitoba', 'New Brunswick', 'Newfoundland and Labrador',
  'Northwest Territories', 'Nova Scotia', 'Nunavut', 'Ontario', 'Prince Edward Island',
  'Quebec', 'Saskatchewan', 'Yukon',
];

Deno.test({
  ...opts,
  name: 'dates: a source timestamp keeps its UTC date through the real handler, in a non-leap and a leap year',
  fn: async () => {
    profile = ONTARIO_WORKER;
    for (const [published_at, label] of [
      ['2026-03-01T00:30:00+01:00', 'February 28, 2026'],
      ['2025-03-01T00:30:00+01:00', 'February 28, 2025'],
      ['2024-03-01T00:30:00+01:00', 'February 29, 2024'],
      ['2026-10-14', 'October 14, 2026'],
    ]) {
      chunks = [row(1, 7, 'A policy update.', { title: 'Policy', published_at })];
      const { status, system } = await ask('What is the latest Express Entry cutoff?');
      assertEquals(status, 200, published_at);
      assertStringIncludes(system, `[Document: Policy] (as of ${label})\nA policy update.`);
    }
  },
});

Deno.test({
  ...opts,
  name: 'dates: the model is told to write dates as Month D, YYYY, in every lane, with and without context',
  fn: async () => {
    profile = ONTARIO_WORKER;
    for (const prompt of [
      'What is the latest Express Entry cutoff?',
      'Is it true that the PGWP fee is 255 dollars?',
      'How do I fill out IMM 5710 and what is the fee?',
      'hello',
    ]) {
      for (const rows of [KB_CHUNKS, []]) {
        chunks = rows;
        const { system } = await ask(prompt);
        assertStringIncludes(system, 'Month D, YYYY', prompt);
        assertStringIncludes(system, 'October 21, 2026', prompt);
        assertStringIncludes(system, 'never write a date as 2026-10-21', prompt);
      }
    }
  },
});

Deno.test({
  ...opts,
  name: 'profile: a future arrival without a persona reaches the model; no persona is invented',
  fn: async () => {
    chunks = [];
    profile = { id: 'user-1', persona: null, city: 'Toronto', province: 'Ontario', arrival_date: '2099-01-15', goals: ['get_pr'] };
    const { status, system } = await ask('What is the latest Express Entry cutoff?');
    assertEquals(status, 200);
    const block = profileBlock(system);
    assertStringIncludes(block, 'You are speaking with a user who plans to arrive in Toronto on January 15, 2099. Their destination province is Ontario.');
    assertStringIncludes(block, 'Their goals: get pr.');
    assert(!block.includes('skilled') && !block.includes('student') && !block.includes('refugee'), block);
  },
});

Deno.test({
  ...opts,
  name: 'profile: a past arrival and a future arrival without a city or persona reach the model',
  fn: async () => {
    chunks = [];
    profile = { id: 'user-1', province: 'ON', arrival_date: '2020-02-01' };
    assertStringIncludes(
      profileBlock((await ask('What is the latest Express Entry cutoff?')).system),
      'You are speaking with a user in Ontario, who arrived on February 1, 2020.'
    );
    profile = { id: 'user-1', persona: '', city: null, province: 'ON', arrival_date: '2099-03-01T00:30:00+01:00' };
    const future = profileBlock((await ask('What is the latest Express Entry cutoff?')).system);
    // 00:30 at +01:00 on March 1, 2099 is February 28 in UTC
    assertStringIncludes(future, 'who plans to arrive in Canada on February 28, 2099. Their destination province is Ontario.');
    profile = { id: 'user-1', city: 'Toronto', arrival_date: 'not a date' };
    const invalid = profileBlock((await ask('What is the latest Express Entry cutoff?')).system);
    assertStringIncludes(invalid, 'You are speaking with a user in Toronto.');
    assert(!invalid.includes('arrive'), invalid);
  },
});

Deno.test({
  ...opts,
  name: 'province: an unmatched stored value is an explicit null with HTTP 200, no pointer and no raw text in the prompt',
  fn: async () => {
    chunks = [];
    for (const province of [
      'constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf',
      'Atlantis', 'Somewhere Else', 'Ontario; drop table', '', '   ', null,
    ]) {
      profile = { id: 'user-1', persona: 'skilled_worker', city: 'Toronto', province, arrival_date: '2099-01-15', goals: ['get_pr'] };
      const { status, rpc, system, calls } = await ask('How do I apply for permanent residence?');
      const label = String(province);
      assertEquals(status, 200, label);
      const body = rpc?.body as Record<string, unknown>;
      assertEquals(Object.keys(JSON.parse(JSON.stringify(body))).sort(), ['filter_province', 'match_count', 'match_threshold', 'query_embedding', 'query_embedding_model'], label);
      assertEquals(body.filter_province, null, label);
      assertEquals([body.match_threshold, body.match_count], [0.3, 10], label);
      assert(!system.includes('PROVINCE IMMIGRATION POINTER'), label);
      const block = profileBlock(system);
      for (const raw of ['constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf', 'Atlantis', 'Somewhere Else', 'drop table', 'destination province']) {
        assert(!block.includes(raw), `${raw} in ${block}`);
      }
      // persona, city, goals and arrival stay
      assertStringIncludes(block, 'You are speaking with a skilled worker who plans to arrive in Toronto on January 15, 2099.');
      assertStringIncludes(block, 'Their goals: get pr.');
      assert(!calls.some(c => c.url.pathname.endsWith('/rpc/refund_chatbot_message')), label);
    }
  },
});

Deno.test({
  ...opts,
  name: 'province: all 13 names and all 23 aliases still filter and point to their own region',
  fn: async () => {
    chunks = [];
    const cases: Array<[string, string | undefined]> = [
      ...REGIONS.map((name): [string, string | undefined] => [name, name]),
      ...ALIASES.map((alias): [string, string | undefined] => [alias, undefined]),
    ];
    const resolved = new Map<string, string>();
    for (const [input, expected] of cases) {
      profile = { id: 'user-1', persona: 'skilled_worker', province: ` ${input.toUpperCase()}. ` };
      const { status, rpc, system } = await ask('What is the latest Express Entry cutoff?');
      assertEquals(status, 200, input);
      const name = (rpc?.body as { filter_province: string }).filter_province;
      assert(REGIONS.includes(name), `${input} -> ${name}`);
      if (expected) assertEquals(name, expected, input);
      resolved.set(input, name);
      assertStringIncludes(system, `The user's province is ${name}.`);
      assertStringIncludes(profileBlock(system) + system, name);
    }
    assertEquals(resolved.size, 36);
    assertEquals(new Set(ALIASES.map(a => resolved.get(a))).size, 13);
  },
});
