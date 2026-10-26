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
  captureConsole,
  captureServe,
  fetchLog,
  json,
  setRoutes,
  supabaseRoute,
  testEnv,
  type FetchCall,
} from '../_shared/testHarness.ts';
import {
  ACCEPTED_MODELS,
  embeddingsBody,
  embeddingsResponse,
  LEAK,
  MALFORMED_ANSWERS,
  nativeVector,
  QWEN_HF_MODEL,
  QWEN_MODEL,
  REJECTED_IDENTITIES,
  storedVector,
} from '../_shared/testEmbeddingFixtures.ts';

const takeHandler = captureServe();
await import('./index.ts');
const handler = takeHandler();
/** The handler's answer as a promise, for requests sent at the same time. */
const serve = (req: Request): Promise<Response> => Promise.resolve(handler(req));

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
      serve(
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

// ---------------------------------------------------------------------------
// Response identity (provider identity repair, spec #177). The answer may name
// the model by its router id or by the catalogue's Hugging Face id, and by
// nothing else. Whichever it uses, the request, the RPC label and the vector
// stay canonical, the user's answer keeps its shape, and the only diagnostic is
// a fixed class plus, after every check passed, a receipt.
// ---------------------------------------------------------------------------

const EXPECTED_CLASS: Record<string, string> = {
  [QWEN_MODEL]: 'canonical',
  [QWEN_HF_MODEL]: 'catalog_hf',
};

/** The fixed texts an embedding refusal may show the user. */
const SAFE_ERRORS = new Set([
  'Invalid embedding response: the body is not JSON',
  'Invalid embedding response: the body is not an object',
  'Invalid embedding response: the model identity is not accepted',
  'Invalid embedding response: the result count does not match the input count',
  'Invalid embedding response: an index is missing or out of range',
  'Invalid embedding response: an index is repeated',
  'Invalid embedding response: a vector does not have 4096 values',
  'Invalid embedding response: a vector value is not a finite number',
  'Invalid embedding response: a vector has no usable length',
]);

type Diagnostic = Record<string, unknown> & { event: string; call_id: string };

/** The adapter's structured lines among everything the handler logged. */
function diagnostics(lines: string[]): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const line of lines) {
    if (!line.startsWith('{')) continue;
    try {
      const value = JSON.parse(line);
      if (value?.event === 'embedding_identity' || value?.event === 'embedding_checked') out.push(value);
    } catch {
      // not one of ours
    }
  }
  return out;
}

/** `ask`, with every console line captured until the response is read. */
async function askLogged(prompt = QUESTION) {
  const logs = captureConsole();
  try {
    const result = await ask(prompt);
    return { ...result, lines: [...logs.lines] };
  } finally {
    logs.restore();
  }
}

const RECEIPT_KEYS = ['call_id', 'checked', 'contract', 'event', 'identity', 'model', 'native_dimensions', 'stored_dimensions'];

// The success answer of the existing canonical path, so the Hugging Face path
// can be held to the same shape.
let canonicalAnswerKeys: string[] | null = null;

for (const model of ACCEPTED_MODELS) {
  Deno.test({
    ...opts,
    name: `an answer naming the model ${model} is searched with the canonical request, label, vector, threshold, count and province`,
    fn: async () => {
      // The raw question, spaces and all, is what is embedded.
      const prompt = `  ${QUESTION}  `;
      embeddingAnswer = () => embeddingsResponse(1, { model, reverse: true });
      const { status, text, embeddings, rpc, chat, refunds, lines } = await askLogged(prompt);
      assertEquals(status, 200);

      assertEquals(embeddings.length, 1);
      assertEquals(embeddings[0].body, { model: QWEN_MODEL, input: [prompt], encoding_format: 'float' });

      assertEquals(rpc.length, 1);
      const body = rpc[0].body as Record<string, unknown>;
      assertEquals(body.query_embedding_model, QWEN_MODEL);
      assertEquals([body.match_threshold, body.match_count, body.filter_province], [0.3, 10, 'Ontario']);
      assertEquals(body.query_embedding, storedVector(0));
      assertEquals(chat.length, 1);
      assertEquals(refunds.length, 0);

      const payload = JSON.parse(text);
      const keys = Object.keys(payload).sort();
      if (model === QWEN_MODEL) canonicalAnswerKeys = keys;
      else assertEquals(keys, canonicalAnswerKeys, 'the answer has the canonical shape');
      // The handler's existing success fields: no hits, so no sources or date,
      // and the stub's one-letter suggestions are dropped by the sanitizer.
      // `context` is the Companion context contract (mobile-app#362).
      assertEquals(keys, ['answer', 'context', 'disclaimer', 'estimatedCostUsd', 'queryType', 'tokenUsage', 'topic']);
      assertEquals([payload.answer, payload.topic], ['Answer.', 'immigration']);
      // The search above ran and found nothing: the context reports the knowledge
      // read as done and names no app content.
      assertEquals(Object.keys(payload.context).sort(), ['clarification', 'guidance', 'items', 'reads', 'version']);
      assertEquals(payload.context.version, 1);
      assertEquals(
        payload.context.reads.filter((r: { capability: string }) => r.capability === 'content.knowledge'),
        [{ capability: 'content.knowledge', status: 'ok' }]
      );
      assertEquals(payload.context.items.filter((i: { kind: string }) => i.kind === 'app_content'), []);

      const diag = diagnostics(lines);
      assertEquals(diag.map(d => d.event), ['embedding_identity', 'embedding_checked']);
      const [identity, receipt] = diag;
      assertEquals(Object.keys(identity).sort(), ['call_id', 'event', 'identity']);
      assertEquals(identity.identity, EXPECTED_CLASS[model]);
      assertEquals(Object.keys(receipt).sort(), RECEIPT_KEYS);
      assertEquals(receipt.call_id, identity.call_id);
      assertEquals(
        [receipt.model, receipt.contract, receipt.identity, receipt.checked, receipt.native_dimensions, receipt.stored_dimensions],
        [QWEN_MODEL, 'qwen3-8b-prefix1536-l2-v1', EXPECTED_CLASS[model], 1, 4096, 1536]
      );
      // The provider's own spelling is checked, never copied.
      if (model === QWEN_HF_MODEL) assert(!lines.some(l => l.includes(QWEN_HF_MODEL)), 'the answer name was logged');
      assert(!lines.some(l => l.includes('openrouter-key')), 'the key was logged');
    },
  });
}

/** One failed embedding: no search, no answer, one refund, a fixed message only. */
function assertRefused(
  result: Awaited<ReturnType<typeof askLogged>>,
  expected: { message?: string; identity?: string; secrets?: string[] }
) {
  const { status, text, embeddings, rpc, chat, refunds, lines } = result;
  assertEquals(status, 500);
  assertEquals(embeddings.length, 1, 'a refused answer is not resent');
  assertEquals(rpc.length, 0, 'no match_chunks call');
  assertEquals(chat.length, 0, 'no answer generated');
  assertEquals(refunds.length, 1, 'the slot is refunded once');
  assertEquals((refunds[0].body as { p_user_id: string }).p_user_id, 'user-1');

  const payload = JSON.parse(text);
  assertEquals(Object.keys(payload), ['error'], 'the error shape is unchanged');
  assert(SAFE_ERRORS.has(payload.error), `not a fixed message: ${payload.error}`);
  if (expected.message) assertEquals(payload.error, expected.message);

  const diag = diagnostics(lines);
  assert(!diag.some(d => d.event === 'embedding_checked'), 'a refused answer has no receipt');
  if (expected.identity) {
    assertEquals(diag.map(d => [d.event, d.identity]), [['embedding_identity', expected.identity]]);
    assertEquals(Object.keys(diag[0]).sort(), ['call_id', 'event', 'identity']);
  }

  const everything = [text, ...lines].join('\n');
  for (const secret of ['openrouter-key', LEAK, ...(expected.secrets ?? [])]) {
    assert(!everything.includes(secret), `${JSON.stringify(secret)} reached the output`);
  }
}

for (const model of ACCEPTED_MODELS) {
  for (const [name, mutate] of MALFORMED_ANSWERS) {
    // rag-query embeds one question; a repeated index needs two rows.
    if (name === 'a repeated index') continue;
    Deno.test({
      ...opts,
      name: `an answer naming ${model} with ${name} never reaches a search and is refunded once`,
      fn: async () => {
        embeddingAnswer = () => embeddingsResponse(1, { model, mutate });
        const result = await askLogged();
        assertRefused(result, {
          // A body that is not JSON has no model field to classify.
          identity: name === 'a body that is not JSON' ? undefined : EXPECTED_CLASS[model],
        });
        if (name === 'a body that is not JSON') assertEquals(diagnostics(result.lines), []);
      },
    });
  }
}

for (const rejected of REJECTED_IDENTITIES) {
  Deno.test({
    ...opts,
    name: `an answer with ${rejected.name} as the model is refused as ${rejected.identity}, never searched, never logged`,
    fn: async () => {
      embeddingAnswer = () => embeddingsResponse(1, { model: rejected.value });
      const result = await askLogged();
      assertRefused(result, {
        message: 'Invalid embedding response: the model identity is not accepted',
        identity: rejected.identity,
        secrets: typeof rejected.value === 'string' && rejected.value !== '' ? [rejected.value] : [],
      });
    },
  });
}

/** A provider answer that waits, so simultaneous requests overlap. */
function later(body: unknown, ms: number): Response {
  return new Promise(resolve => setTimeout(() => resolve(json(body)), ms)) as unknown as Response;
}

/** Answer each question with its own model name, vector tag and delay. */
function identityRoutes(byQuestion: Record<string, { model: unknown; tag: number; delay: number }>, profile: unknown[]) {
  return (call: FetchCall): Response | undefined => {
    if (call.url.pathname === '/rest/v1/rpc/match_chunks') return later([], 5);
    const supabase = supabaseRoute(call, {
      userId: 'user-1',
      rpc: { check_and_increment_chatbot_usage: true, match_chunks: [] },
      tables: { user_onboarding_profiles: profile },
    });
    if (supabase) return supabase;
    if (call.url.pathname.endsWith('/embeddings')) {
      const plan = byQuestion[(call.body as { input: string[] }).input[0]];
      const body = embeddingsBody(1, { model: plan.model });
      (body.data as Array<{ embedding: number[] }>)[0].embedding = nativeVector(plan.tag);
      return later(body, plan.delay);
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
  };
}

/** Each call id's identity class and receipt, from one run's captured lines. */
function byCall(lines: string[]) {
  const calls = new Map<string, { identity: unknown[]; receipt: Diagnostic[] }>();
  for (const d of diagnostics(lines)) {
    const entry = calls.get(d.call_id) ?? { identity: [], receipt: [] };
    if (d.event === 'embedding_identity') entry.identity.push(d.identity);
    else entry.receipt.push(d);
    calls.set(d.call_id, entry);
  }
  return calls;
}

Deno.test({
  ...opts,
  name: 'simultaneous requests with different identity classes and provinces keep their own class, receipt, vector and province',
  fn: async () => {
    const plans = {
      'Ontario question': { model: QWEN_MODEL, tag: 0, delay: 20, province: 'ON', class: 'canonical' },
      'BC question': { model: QWEN_HF_MODEL, tag: 1, delay: 10, province: 'BC', class: 'catalog_hf' },
      'Alberta question': { model: `${QWEN_MODEL}?key=${LEAK}`, tag: 2, delay: 0, province: 'AB', class: 'unrecognized_string' },
    };
    setRoutes(identityRoutes(plans, []));
    testEnv.EVAL_BYPASS_SECRET = 'local-test-secret';
    const logs = captureConsole();
    let statuses: number[];
    let texts: string[];
    try {
      const results = await Promise.all(
        Object.entries(plans).map(([prompt, plan]) =>
          serve(
            new Request('http://localhost/rag-query', {
              method: 'POST',
              headers: {
                Authorization: 'Bearer user-jwt',
                'Content-Type': 'application/json',
                'x-eval-mode': '1',
                'x-eval-secret': 'local-test-secret',
              },
              body: JSON.stringify({
                conversationIdentifier: plan.province,
                prompt,
                eval_profile: { persona: 'skilled_worker', province: plan.province },
              }),
            })
          ).then(async r => ({ status: r.status, text: await r.text() }))
        )
      );
      statuses = results.map(r => r.status);
      texts = results.map(r => r.text);
    } finally {
      logs.restore();
    }
    assertEquals(statuses, [200, 200, 500]);
    assertEquals(JSON.parse(texts[2]), { error: 'Invalid embedding response: the model identity is not accepted' });

    const rpc = fetchLog
      .filter(c => c.url.pathname === '/rest/v1/rpc/match_chunks')
      .map(c => c.body as { filter_province: string; query_embedding: number[]; query_embedding_model: string });
    assertEquals(rpc.map(b => b.filter_province).sort(), ['British Columbia', 'Ontario'], 'no search for the refused request');
    const byProvince = Object.fromEntries(rpc.map(b => [b.filter_province, b]));
    assertEquals(byProvince.Ontario.query_embedding, storedVector(0));
    assertEquals(byProvince['British Columbia'].query_embedding, storedVector(1));
    for (const body of rpc) assertEquals(body.query_embedding_model, QWEN_MODEL);

    // One call id per provider call, each with its own class; a receipt only
    // for the two accepted calls, carrying that call's own class.
    const calls = byCall(logs.lines);
    assertEquals(calls.size, 3);
    const seen = [...calls.values()].map(c => {
      assertEquals(c.identity.length, 1);
      return c.identity[0];
    });
    assertEquals(seen.sort(), ['canonical', 'catalog_hf', 'unrecognized_string']);
    for (const [id, c] of calls) {
      if (c.identity[0] === 'unrecognized_string') {
        assertEquals(c.receipt, [], 'the refused call has no receipt');
      } else {
        assertEquals(c.receipt.length, 1);
        assertEquals([c.receipt[0].call_id, c.receipt[0].identity], [id, c.identity[0]]);
      }
    }
    assert(![...texts, ...logs.lines].join('\n').includes(LEAK), 'a credential reached the output');
  },
});

Deno.test({
  ...opts,
  name: 'simultaneous counted requests refund only the refused one, once',
  fn: async () => {
    const plans = {
      'First question': { model: QWEN_MODEL, tag: 0, delay: 15 },
      'Second question': { model: null, tag: 1, delay: 0 },
      'Third question': { model: QWEN_HF_MODEL, tag: 2, delay: 5 },
    };
    setRoutes(identityRoutes(plans, [{ id: 'user-1', province: 'ON' }]));
    const logs = captureConsole();
    let statuses: number[];
    try {
      statuses = await Promise.all(
        Object.keys(plans).map(prompt =>
          serve(
            new Request('http://localhost/rag-query', {
              method: 'POST',
              headers: { Authorization: 'Bearer user-jwt', 'Content-Type': 'application/json' },
              body: JSON.stringify({ conversationIdentifier: prompt, prompt }),
            })
          ).then(async r => (await r.text(), r.status))
        )
      );
    } finally {
      logs.restore();
    }
    assertEquals(statuses, [200, 500, 200]);
    const named = (name: string) => fetchLog.filter(c => c.url.pathname === `/rest/v1/rpc/${name}`);
    assertEquals(named('check_and_increment_chatbot_usage').length, 3);
    assertEquals(named('refund_chatbot_message').length, 1);
    const rpc = named('match_chunks').map(c => c.body as { query_embedding: number[]; query_embedding_model: string; filter_province: string });
    assertEquals(rpc.length, 2);
    assertEquals(rpc.map(b => b.query_embedding).sort((a, b) => a[0] - b[0]), [storedVector(2), storedVector(0)].sort((a, b) => a[0] - b[0]));
    for (const body of rpc) assertEquals([body.query_embedding_model, body.filter_province], [QWEN_MODEL, 'Ontario']);
    const classes = [...byCall(logs.lines).values()].map(c => c.identity[0]).sort();
    assertEquals(classes, ['canonical', 'catalog_hf', 'null']);
  },
});
