// rag-query handler: two requests at once, one streaming and one not (spec
// UnifyCN/web-app#177, ticket #181). Runs the real Deno.serve handler; only the
// network is stubbed (_shared/testHarness.ts). Each request must keep its own
// province filter, citations, source date and topic, and the answer must keep
// its numeric condition, however the model stream is cut into chunks.
//
// RUN (from web-app/):
//   deno test --no-check --node-modules-dir=auto supabase/functions/rag-query/index_concurrent_test.ts

import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import {
  captureServe,
  fetchLog,
  json,
  openRouterCompletion,
  setRoutes,
  sse,
  supabaseRoute,
  testEnv,
} from '../_shared/testHarness.ts';
import { embeddingsResponse, storedVector } from '../_shared/testEmbeddingFixtures.ts';

const takeHandler = captureServe();
await import('./index.ts');
const handler = takeHandler();

testEnv.EVAL_BYPASS_SECRET = 'local-test-secret';

const ANSWER = 'The limit is 20 hours only if eligible.';
const RAW = `${ANSWER}\n[SUGGESTIONS]: One? | Two?\n[TOPIC]: immigration`;
const opts = { sanitizeOps: false, sanitizeResources: false };

/** Cut text into chunks of the given sizes, repeating the sizes as needed. */
function cut(text: string, sizes: number[]): string[] {
  const parts: string[] = [];
  let at = 0;
  for (let i = 0; at < text.length; i++) {
    const size = sizes[i % sizes.length];
    parts.push(text.slice(at, at + size));
    at += size;
  }
  return parts;
}

function sseEvents(text: string) {
  return text
    .trim()
    .split('\n\n')
    .map(block => {
      const [event, data] = block.split('\n');
      return { name: event.slice(7), data: JSON.parse(data.slice(6)) };
    });
}

async function runPair(sizes: number[]) {
  setRoutes(call => {
    if (call.url.pathname.endsWith('/rpc/match_chunks')) {
      const province = (call.body as { filter_province: string | null }).filter_province;
      const slug = province === 'Ontario' ? 'on' : 'bc';
      const rows = [
        {
          document_id: 7,
          chunk_text: `${province} source.`,
          knowledge_documents: {
            title: String(province),
            source_url: `https://example.test/${slug}`,
            published_at: '2026-03-01T00:30:00+01:00',
            updated_at: '2026-10-15T00:00:00Z',
          },
        },
      ];
      // Ontario answers later than British Columbia, so the two overlap.
      return new Promise(resolve =>
        setTimeout(() => resolve(json(rows)), province === 'Ontario' ? 15 : 0)
      ) as unknown as Response;
    }
    const supabase = supabaseRoute(call, { userId: 'user-1' });
    if (supabase) return supabase;
    if (call.url.pathname.endsWith('/embeddings')) return embeddingsResponse((call.body as { input: unknown[] }).input.length);
    if (call.url.pathname.endsWith('/chat/completions')) {
      const body = call.body as { stream?: boolean };
      if (!body.stream) return openRouterCompletion(RAW);
      return sse(
        cut(RAW, sizes)
          .map(content => ({ choices: [{ delta: { content }, finish_reason: null }] }))
          .concat([
            { choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } },
          ] as never)
      );
    }
    return json({ ok: true });
  });

  const ask = async (province: string, stream: boolean) => {
    const response = await handler(
      new Request('http://localhost/rag-query', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test',
          'Content-Type': 'application/json',
          'x-eval-mode': '1',
          'x-eval-secret': 'local-test-secret',
        },
        body: JSON.stringify({
          prompt: 'What are the immigration work rules?',
          conversationIdentifier: province,
          stream,
          eval_profile: { persona: 'skilled_worker', province, arrival_date: '2099-01-15' },
        }),
      })
    );
    return { status: response.status, text: await response.text() };
  };

  // Both calls start with no delay between them.
  const [on, bc] = await Promise.all([ask('ON', true), ask('BC', false)]);
  return { on, bc, calls: fetchLog.filter(c => c.url.pathname.endsWith('/rpc/match_chunks')) };
}

Deno.test({
  ...opts,
  name: 'a streaming and a plain request at once keep province, citations, date, topic and the numeric condition, for any chunking',
  fn: async () => {
    const chunkings = [[1], [2], [3], [5, 1], [7], [1, 2, 3, 11], [13, 4, 1], [RAW.length]];
    for (const sizes of chunkings) {
      const { on, bc, calls } = await runPair(sizes);
      const label = JSON.stringify(sizes);
      assertEquals([on.status, bc.status], [200, 200], label);

      const events = sseEvents(on.text);
      const metadata = events.find(e => e.name === 'metadata')!.data;
      const complete = events.find(e => e.name === 'complete')!.data;
      const tokens = events
        .filter(e => e.name === 'token')
        .map(e => e.data.delta)
        .join('');
      const plain = JSON.parse(bc.text);

      assertEquals(metadata.sources.map((s: { url: string }) => s.url), ['https://example.test/on'], label);
      assertEquals(plain.sources.map((s: { url: string }) => s.url), ['https://example.test/bc'], label);
      assertEquals([metadata.lastVerified, plain.lastVerified], ['2026-10-15T00:00:00Z', '2026-10-15T00:00:00Z'], label);
      assertEquals([complete.topic, plain.topic], ['immigration', 'immigration'], label);
      assertEquals([complete.cleanAnswer, plain.answer], [ANSWER, ANSWER], label);
      assertStringIncludes(tokens, ANSWER);
      assert(!tokens.includes('[TOPIC]'), `${label}: ${tokens}`);

      assertEquals(calls.length, 2, label);
      const provinces = calls.map(c => (c.body as { filter_province: string }).filter_province).sort();
      assertEquals(provinces, ['British Columbia', 'Ontario'], label);
      for (const call of calls) {
        const body = call.body as Record<string, unknown>;
        assertEquals(Object.keys(body).sort(), ['filter_province', 'match_count', 'match_threshold', 'query_embedding', 'query_embedding_model'], label);
        assertEquals([body.match_count, body.match_threshold, body.query_embedding], [10, 0.3, storedVector(0)], label);
      }

      // each request's own model call carries its own province and the UTC source date
      const prompts = fetchLog
        .filter(c => c.url.pathname.endsWith('/chat/completions'))
        .map(c => (c.body as { messages: Array<{ role: string; content: string }> }).messages.find(m => m.role === 'system')!.content);
      assertEquals(prompts.length, 2, label);
      for (const prompt of prompts) {
        assertStringIncludes(prompt, '(as of February 28, 2026)');
        assertStringIncludes(prompt, 'who plans to arrive in Canada on January 15, 2099');
      }
      assertEquals(prompts.filter(p => p.includes("The user's province is Ontario.")).length, 1, label);
      assertEquals(prompts.filter(p => p.includes("The user's province is British Columbia.")).length, 1, label);
    }
  },
});
