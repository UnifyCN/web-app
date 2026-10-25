// rag-query handler: the Qwen query embedding contract (spec UnifyCN/web-app#177,
// ticket #187). Runs the real Deno.serve handler; only the network is stubbed
// (_shared/testHarness.ts). Each test reads the embedding request the handler
// sent, the match_chunks RPC it made from the provider answer, and what the
// user got back. The provider is a stub: this proves the protocol, not a real
// OpenRouter answer.
//
// RUN (from web-app/):
//   deno test --no-check --node-modules-dir=auto supabase/functions/rag-query/index_embedding_test.ts

import { assert, assertEquals } from 'jsr:@std/assert@1';
import {
  captureServe,
  fetchLog,
  json,
  setRoutes,
  supabaseRoute,
  testEnv,
  type FetchCall,
} from '../_shared/testHarness.ts';
import {
  embeddingsBody,
  embeddingsResponse,
  nativeVector,
  QWEN_MODEL,
  storedVector,
} from '../_shared/testEmbeddingFixtures.ts';

const takeHandler = captureServe();
await import('./index.ts');
const handler = takeHandler();

const QUESTION = 'What is the latest Express Entry cutoff?';
const opts = { sanitizeOps: false, sanitizeResources: false };

/** What the stubbed embeddings endpoint answers. */
let embeddingAnswer: (call: FetchCall) => Response = call =>
  embeddingsResponse(((call.body as { input: unknown[] }).input ?? []).length);

function routes(call: FetchCall): Response | undefined {
  const supabase = supabaseRoute(call, {
    userId: 'user-1',
    rpc: { check_and_increment_chatbot_usage: true, match_chunks: [] },
    tables: { user_onboarding_profiles: [{ id: 'user-1', province: 'ON' }] },
  });
  if (supabase) return supabase;
  if (call.url.hostname === 'openrouter.ai') {
    if (call.url.pathname.endsWith('/embeddings')) return embeddingAnswer(call);
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

async function ask(prompt = QUESTION) {
  setRoutes(routes);
  const res = await handler(
    new Request('http://localhost/rag-query', {
      method: 'POST',
      headers: { Authorization: 'Bearer user-jwt', 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationIdentifier: 'conv-1', prompt }),
    })
  );
  const text = await res.text();
  const calls = [...fetchLog];
  return {
    status: res.status,
    text,
    calls,
    embeddings: calls.filter(c => c.url.pathname.endsWith('/embeddings')),
    rpc: calls.filter(c => c.url.pathname === '/rest/v1/rpc/match_chunks'),
    chat: calls.filter(c => c.url.pathname.endsWith('/chat/completions')),
    refunds: calls.filter(c => c.url.pathname === '/rest/v1/rpc/refund_chatbot_message'),
  };
}

Deno.test({
  ...opts,
  name: 'the query embedding: one raw question to OpenRouter with the Qwen model, then the five-name RPC with the right vector',
  fn: async () => {
    // Rows come back out of order; input 0 is the only input, so its vector
    // (tag 0: [3, 4, ...] -> [0.6, 0.8, ...]) must be the one searched.
    embeddingAnswer = () => embeddingsResponse(1, { reverse: true });
    const { status, embeddings, rpc, calls } = await ask();
    assertEquals(status, 200);

    assertEquals(embeddings.length, 1);
    const request = embeddings[0];
    assertEquals(request.method, 'POST');
    assertEquals(request.url.href, 'https://openrouter.ai/api/v1/embeddings');
    assertEquals(request.body, {
      model: 'qwen/qwen3-embedding-8b',
      input: [QUESTION],
      encoding_format: 'float',
    });
    // No dimensions, no input_type, no profile text, no query instruction.
    assertEquals(Object.keys(request.body as object).sort(), ['encoding_format', 'input', 'model']);
    assert(!calls.some(c => c.url.hostname === 'api.openai.com'), 'no direct OpenAI request');

    assertEquals(rpc.length, 1);
    const body = rpc[0].body as Record<string, unknown>;
    assertEquals(Object.keys(body).sort(), [
      'filter_province',
      'match_count',
      'match_threshold',
      'query_embedding',
      'query_embedding_model',
    ]);
    assertEquals(body.query_embedding_model, QWEN_MODEL);
    assertEquals([body.match_threshold, body.match_count, body.filter_province], [0.3, 10, 'Ontario']);
    const vector = body.query_embedding as number[];
    assertEquals(vector.length, 1536);
    assertEquals(vector, storedVector(0));
    assertEquals([vector[0], vector[1]], [3 / 5, 4 / 5]);
  },
});

type Mutation = (body: Record<string, any>) => unknown;

/** A 200 answer whose body is the fixture after `mutate`, or a raw string. */
function bad(mutate: Mutation): (call: FetchCall) => Response {
  return () => embeddingsResponse(1, { mutate });
}

const withVector = (embedding: unknown): Mutation => body => {
  body.data[0].embedding = embedding;
  return body;
};

const FAILURES: Array<[string, (call: FetchCall) => Response]> = [
  ['another model', bad(b => ({ ...b, model: 'openai/text-embedding-3-small' }))],
  ['a missing model', bad(b => { delete b.model; return b; })],
  ['a missing index', bad(b => { delete b.data[0].index; return b; })],
  ['an out-of-range index', bad(b => { b.data[0].index = 1; return b; })],
  ['a negative index', bad(b => { b.data[0].index = -1; return b; })],
  ['a fractional index', bad(b => { b.data[0].index = 0.5; return b; })],
  ['no result rows', bad(b => { b.data = []; return b; })],
  ['an extra result row', bad(b => { b.data.push({ ...b.data[0] }); return b; })],
  ['1536 values', bad(withVector(nativeVector(0).slice(0, 1536)))],
  ['4095 values', bad(withVector(nativeVector(0).slice(0, 4095)))],
  ['4097 values', bad(withVector([...nativeVector(0), 1]))],
  ['a zero retained prefix', bad(withVector(nativeVector(0).map((v, i) => (i < 1536 ? 0 : v))))],
  ['a null value (a non-finite number sent as JSON)', bad(withVector(nativeVector(0).map((v, i) => (i === 2000 ? null : v))))],
  ['a base64 string instead of floats', bad(withVector('AAAA'))],
  ['malformed JSON', bad(() => '{"model": "qwen/qwen3-embedding-8b", "data": [')],
  ['a provider HTTP 401', () => json({ error: { message: 'secret-detail-from-provider' } }, 401)],
];

for (const [name, answer] of FAILURES) {
  Deno.test({
    ...opts,
    name: `an embedding answer with ${name} never reaches a search; the message slot is refunded and the user gets the usual error`,
    fn: async () => {
      embeddingAnswer = answer;
      const { status, text, rpc, chat, embeddings, refunds } = await ask();
      assertEquals(status, 500);
      assertEquals(rpc.length, 0, 'no match_chunks call');
      assertEquals(chat.length, 0, 'no answer generated');
      assertEquals(embeddings.length, 1);
      assertEquals(refunds.length, 1, 'the slot is refunded once');
      assert(!text.includes('openrouter-key'), 'the key is not echoed');
      assert(!text.includes('secret-detail-from-provider'), 'the provider body is not echoed');
    },
  });
}

Deno.test({
  ...opts,
  name: 'an embedding answer with a non-finite number (1e999) never reaches a search',
  fn: async () => {
    embeddingAnswer = () =>
      new Response(
        JSON.stringify(embeddingsBody(1)).replace('"embedding":[3,', '"embedding":[1e999,'),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    const { status, rpc, chat, refunds } = await ask();
    assertEquals([status, rpc.length, chat.length, refunds.length], [500, 0, 0, 1]);
  },
});

Deno.test({
  ...opts,
  name: 'a provider 500 is retried within the budget and the final failure never reaches a search',
  fn: async () => {
    embeddingAnswer = () => json({ error: 'boom' }, 500);
    const { status, rpc, embeddings, refunds } = await ask();
    assertEquals([status, rpc.length, refunds.length], [500, 0, 1]);
    assertEquals(embeddings.length, 3, 'one try and two retries, as before');
  },
});

Deno.test({
  ...opts,
  name: 'a no-hit search is still the existing no-source answer, not an error',
  fn: async () => {
    embeddingAnswer = call =>
      embeddingsResponse((call.body as { input: unknown[] }).input.length);
    const { status, text, rpc, refunds } = await ask();
    assertEquals(status, 200);
    assertEquals(rpc.length, 1);
    assertEquals(refunds.length, 0);
    const payload = JSON.parse(text);
    assertEquals(payload.sources ?? [], []);
    assert(typeof payload.answer === 'string' && payload.answer.length > 0);
  },
});

Deno.test({
  ...opts,
  name: 'simultaneous requests with different provinces and embedding indexes each keep their own vector and province',
  fn: async () => {
    // Each question gets a different worked vector (tag by question), and the
    // slower one answers last, so the two requests overlap.
    const tags: Record<string, number> = { 'Question A about Ontario work': 0, 'Question B about BC work': 1 };
    const provinces: Record<string, string> = { ON: 'Ontario', BC: 'British Columbia' };
    setRoutes(call => {
      const supabase = supabaseRoute(call, {
        userId: 'user-1',
        rpc: { check_and_increment_chatbot_usage: true, match_chunks: [] },
        tables: { user_onboarding_profiles: [] },
      });
      if (call.url.pathname === '/rest/v1/rpc/match_chunks') {
        const body = call.body as { filter_province: string };
        return new Promise(resolve =>
          setTimeout(() => resolve(json([])), body.filter_province === 'Ontario' ? 20 : 0)
        ) as unknown as Response;
      }
      if (supabase) return supabase;
      if (call.url.pathname.endsWith('/embeddings')) {
        const input = (call.body as { input: string[] }).input[0];
        const tag = tags[input];
        const response = embeddingsBody(1);
        (response.data as Array<{ embedding: number[] }>)[0].embedding = nativeVector(tag);
        const delay = tag === 0 ? 15 : 0;
        return new Promise(resolve =>
          setTimeout(() => resolve(json(response)), delay)
        ) as unknown as Response;
      }
      if (call.url.pathname.endsWith('/chat/completions')) {
        return json({
          choices: [{ message: { content: 'Answer.\n[TOPIC]: immigration' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          model: 'test/model',
          provider: 'TestProvider',
        });
      }
      if (call.url.hostname.endsWith('posthog.com')) return json({ status: 1 });
      return undefined;
    });
    const askAs = (prompt: string, code: string) =>
      handler(
        new Request('http://localhost/rag-query', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer user-jwt',
            'Content-Type': 'application/json',
            'x-eval-mode': '1',
            'x-eval-secret': 'local-test-secret',
          },
          body: JSON.stringify({
            conversationIdentifier: code,
            prompt,
            eval_profile: { persona: 'skilled_worker', province: code },
          }),
        })
      ).then(r => r.status);
    testEnv.EVAL_BYPASS_SECRET = 'local-test-secret';
    const statuses = await Promise.all([
      askAs('Question A about Ontario work', 'ON'),
      askAs('Question B about BC work', 'BC'),
    ]);
    assertEquals(statuses, [200, 200]);
    const rpc = fetchLog
      .filter(c => c.url.pathname === '/rest/v1/rpc/match_chunks')
      .map(c => c.body as { filter_province: string; query_embedding: number[]; query_embedding_model: string });
    assertEquals(rpc.length, 2);
    const byProvince = Object.fromEntries(rpc.map(b => [b.filter_province, b]));
    assertEquals(Object.keys(byProvince).sort(), [provinces.BC, provinces.ON]);
    assertEquals(byProvince.Ontario.query_embedding, storedVector(0));
    assertEquals(byProvince['British Columbia'].query_embedding, storedVector(1));
    for (const body of rpc) assertEquals(body.query_embedding_model, QWEN_MODEL);
  },
});
