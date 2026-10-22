// rag-query handler: platform tag + topic label (spec UnifyCN/mobile-app#314,
// ticket #318). Runs the real Deno.serve handler; only the network (Supabase,
// OpenRouter, PostHog) is stubbed, through _shared/testHarness.ts.
//
// RUN (from web-app/):
//   deno test supabase/functions/rag-query/index_test.ts

import { assert, assertEquals } from 'jsr:@std/assert@1';
import {
  aiGenerationEvents,
  captureServe,
  json,
  setRoutes,
  sse,
  supabaseRoute,
  type FetchCall,
} from '../_shared/testHarness.ts';

const takeHandler = captureServe();
await import('./index.ts');
const handler = takeHandler();

const ANSWER = 'Here is how it works.\n[SUGGESTIONS]: How long does it take? | What does it cost?';

function routes(call: FetchCall): Response | undefined {
  const supabase = supabaseRoute(call, {
    userId: 'user-1',
    rpc: { check_and_increment_chatbot_usage: true, match_chunks: [] },
  });
  if (supabase) return supabase;
  if (call.url.hostname === 'openrouter.ai') {
    if (call.url.pathname.endsWith('/embeddings')) {
      return json({ data: [{ embedding: [0.1, 0.2, 0.3] }] });
    }
    if (call.url.pathname.endsWith('/chat/completions')) {
      const usage = {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
        cost: 0.0001,
      };
      if ((call.body as { stream?: boolean })?.stream) {
        return sse([
          { choices: [{ delta: { content: ANSWER }, finish_reason: null }] },
          {
            choices: [{ delta: {}, finish_reason: 'stop' }],
            usage,
            model: 'test/model',
            provider: 'TestProvider',
          },
        ]);
      }
      return json({
        choices: [{ message: { content: ANSWER }, finish_reason: 'stop' }],
        usage,
        model: 'test/model',
        provider: 'TestProvider',
      });
    }
  }
  if (call.url.hostname.endsWith('posthog.com')) return json({ status: 1 });
  return undefined;
}

function request(body: Record<string, unknown>): Request {
  return new Request('http://localhost/rag-query', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer user-jwt',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ conversationIdentifier: 'conv-1', ...body }),
  });
}

/** Parse a text/event-stream body into [event, data] pairs. */
function parseSse(text: string): Array<[string, Record<string, unknown>]> {
  return text
    .split('\n\n')
    .filter(block => block.trim())
    .map(block => {
      const event = block.match(/^event: (.*)$/m)?.[1] ?? '';
      const data = JSON.parse(block.match(/^data: (.*)$/m)?.[1] ?? 'null');
      return [event, data];
    });
}

async function ask(body: Record<string, unknown>) {
  setRoutes(routes);
  const res = await handler(request(body));
  const payload = await res.json();
  const events = aiGenerationEvents();
  assertEquals(events.length, 1, 'exactly one $ai_generation event');
  return { status: res.status, payload, event: events[0] };
}

// Background persistence (usage RPC) may still be in flight when a test ends.
const opts = { sanitizeOps: false, sanitizeResources: false };

Deno.test({
  ...opts,
  name: 'a request platform is put on $ai_generation; topic goes to the event and the client',
  fn: async () => {
    const { status, payload, event } = await ask({
      prompt: 'How do I find an apartment to rent in Calgary?',
      platform: 'ios',
    });
    assertEquals(status, 200);
    assertEquals(event.platform, 'ios');
    assertEquals(event.feature, 'ai_companion');
    assertEquals(event.topic, 'housing');
    assertEquals(payload.topic, 'housing');
  },
});

Deno.test({
  ...opts,
  name: 'an old mobile build (no platform, no source) still gets platform "mobile" and a normal answer',
  fn: async () => {
    const { status, payload, event } = await ask({
      prompt: 'Do I need to file taxes in my first year?',
    });
    assertEquals(status, 200);
    assertEquals(event.platform, 'mobile');
    assertEquals(event.feature, 'ai_companion');
    // The fields old clients read are unchanged; topic is only an extra key.
    assertEquals(payload.answer, 'Here is how it works.');
    assertEquals(payload.queryType, 'immigration');
    assertEquals(payload.suggestedNextSteps, [
      'How long does it take?',
      'What does it cost?',
    ]);
    assertEquals(payload.topic, 'taxes');
  },
});

Deno.test({
  ...opts,
  name: 'the legacy source:"web" tag still gives platform "web"',
  fn: async () => {
    const { event } = await ask({
      prompt: 'How do I open a bank account?',
      source: 'web',
    });
    assertEquals(event.platform, 'web');
    assertEquals(event.topic, 'money');
  },
});

Deno.test({
  ...opts,
  name: 'streaming: topic is in the metadata event (beside queryType) and on $ai_generation',
  fn: async () => {
    setRoutes(routes);
    const res = await handler(
      request({
        prompt: 'How do I find a family doctor?',
        platform: 'android',
        stream: true,
      })
    );
    assertEquals(res.status, 200);
    const events = parseSse(await res.text());
    const metadata = events.find(([name]) => name === 'metadata')?.[1];
    assert(metadata, 'metadata event sent');
    assertEquals(metadata.queryType, 'immigration');
    assertEquals(metadata.topic, 'health');
    assert(events.some(([name]) => name === 'complete'), 'complete event sent');

    const generations = aiGenerationEvents();
    assertEquals(generations.length, 1);
    assertEquals(generations[0].platform, 'android');
    assertEquals(generations[0].topic, 'health');
    assertEquals(generations[0].feature, 'ai_companion');
  },
});

Deno.test({
  ...opts,
  name: 'a follow-up takes the topic of the previous user question',
  fn: async () => {
    const { payload } = await ask({
      prompt: 'How long does that usually take?',
      platform: 'web',
      messages: [
        { role: 'user', message: 'How do I open a bank account?' },
        { role: 'assistant', message: 'You can rent a safety deposit box too.' },
      ],
    });
    assertEquals(payload.topic, 'money');
  },
});

Deno.test({
  ...opts,
  name: 'an in-lesson question takes the topic of the lesson',
  fn: async () => {
    const { payload } = await ask({
      prompt: 'What does this mean?',
      platform: 'web',
      lessonContext: { lessonId: 'lesson-1', lessonTitle: 'Filing your first tax return' },
    });
    assertEquals(payload.topic, 'taxes');
  },
});

Deno.test({
  ...opts,
  name: 'a greeting is "other" even after a topic question',
  fn: async () => {
    const { payload } = await ask({
      prompt: 'Thanks!',
      platform: 'web',
      messages: [{ role: 'user', message: 'How do I open a bank account?' }],
    });
    assertEquals(payload.queryType, 'general');
    assertEquals(payload.topic, 'other');
  },
});
