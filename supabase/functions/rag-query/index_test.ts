// rag-query handler: platform tag + topic label (spec UnifyCN/mobile-app#314,
// ticket #318). Runs the real Deno.serve handler; only the network (Supabase,
// OpenRouter, PostHog) is stubbed, through _shared/testHarness.ts. The topic
// comes from the answer model's [TOPIC] line, so each test sets the line the
// stubbed model writes and checks what rag-query does with it.
//
// RUN (from web-app/):
//   deno test supabase/functions/rag-query/index_test.ts

import { assert, assertEquals } from 'jsr:@std/assert@1';
import {
  aiGenerationEvents,
  captureServe,
  fetchLog,
  json,
  setRoutes,
  sse,
  supabaseRoute,
  type FetchCall,
} from '../_shared/testHarness.ts';
import { TOPIC_INSTRUCTION } from './lib/topic.ts';

const takeHandler = captureServe();
await import('./index.ts');
const handler = takeHandler();

const ANSWER = 'Here is how it works.\n[SUGGESTIONS]: How long does it take? | What does it cost?';

/** What the stubbed answer model ends its reply with (the topic tag line). */
let modelTail = '\n[TOPIC]: housing';

function chatCalls(): FetchCall[] {
  return fetchLog.filter(
    call =>
      call.url.hostname === 'openrouter.ai' &&
      call.url.pathname.endsWith('/chat/completions')
  );
}

function systemPrompt(call: FetchCall): string {
  const body = call.body as { messages: Array<{ role: string; content: string }> };
  return body.messages.find(m => m.role === 'system')?.content ?? '';
}

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
      const content = ANSWER + modelTail;
      if ((call.body as { stream?: boolean })?.stream) {
        // Split mid-tag, the way tokens really arrive.
        const cut = content.length - 9;
        return sse([
          { choices: [{ delta: { content: content.slice(0, cut) }, finish_reason: null }] },
          { choices: [{ delta: { content: content.slice(cut) }, finish_reason: null }] },
          {
            choices: [{ delta: {}, finish_reason: 'stop' }],
            usage,
            model: 'test/model',
            provider: 'TestProvider',
          },
        ]);
      }
      return json({
        choices: [{ message: { content }, finish_reason: 'stop' }],
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

async function ask(body: Record<string, unknown>, tail = '\n[TOPIC]: housing') {
  modelTail = tail;
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
  name: 'a request platform is put on $ai_generation; the model topic goes to the event and the client',
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
    // The tag never reaches the answer the user sees.
    assertEquals(payload.answer, 'Here is how it works.');
  },
});

Deno.test({
  ...opts,
  name: 'the topic comes from the one answer call: no extra model call, instruction last',
  fn: async () => {
    await ask({
      prompt: 'Làm sao để thuê nhà ở Toronto?',
      platform: 'android',
      responseLanguage: 'vi',
    });
    const calls = chatCalls();
    assertEquals(calls.length, 1, 'exactly one chat completion per question');
    const system = systemPrompt(calls[0]);
    assert(system.endsWith(TOPIC_INSTRUCTION), 'topic instruction ends the prompt');
    assert(
      system.indexOf('RESPONSE LANGUAGE') < system.indexOf('TOPIC LABEL'),
      'after the response-language directive'
    );
  },
});

Deno.test({
  ...opts,
  name: 'a Vietnamese housing question is labelled housing',
  fn: async () => {
    const { payload, event } = await ask(
      { prompt: 'Làm sao để thuê nhà ở Toronto?', platform: 'ios', responseLanguage: 'vi' },
      '\n[TOPIC]: housing'
    );
    assertEquals(payload.topic, 'housing');
    assertEquals(event.topic, 'housing');
  },
});

Deno.test({
  ...opts,
  name: 'an Arabic housing question is labelled housing',
  fn: async () => {
    const { payload, event } = await ask(
      { prompt: 'كيف أستأجر شقة في مونتريال؟', platform: 'web', responseLanguage: 'ar' },
      '\n**[TOPIC]:** Housing'
    );
    assertEquals(payload.topic, 'housing');
    assertEquals(event.topic, 'housing');
    assertEquals(payload.answer, 'Here is how it works.');
  },
});

Deno.test({
  ...opts,
  name: 'an off-list label (here translated) falls back to "other"',
  fn: async () => {
    const { payload, event } = await ask(
      { prompt: 'كيف أستأجر شقة؟', platform: 'web', responseLanguage: 'ar' },
      '\n[TOPIC]: السكن'
    );
    assertEquals(payload.topic, 'other');
    assertEquals(event.topic, 'other');
    assertEquals(payload.answer, 'Here is how it works.');
  },
});

Deno.test({
  ...opts,
  name: 'a reply with no topic tag falls back to "other" and still answers normally',
  fn: async () => {
    const { status, payload, event } = await ask(
      { prompt: 'Hello there, what is this?', platform: 'web' },
      ''
    );
    assertEquals(status, 200);
    assertEquals(payload.topic, 'other');
    assertEquals(event.topic, 'other');
    assertEquals(payload.suggestedNextSteps, [
      'How long does it take?',
      'What does it cost?',
    ]);
  },
});

Deno.test({
  ...opts,
  name: 'an old mobile build (no platform, no source) still gets platform "mobile" and a normal answer',
  fn: async () => {
    const { status, payload, event } = await ask(
      { prompt: 'Do I need to file taxes in my first year?' },
      '\n[TOPIC]: taxes'
    );
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
    const { event } = await ask(
      { prompt: 'How do I open a bank account?', source: 'web' },
      '\n[TOPIC]: money'
    );
    assertEquals(event.platform, 'web');
    assertEquals(event.topic, 'money');
  },
});

Deno.test({
  ...opts,
  name: 'streaming: topic is in the complete event and on $ai_generation; no token carries the tag',
  fn: async () => {
    modelTail = '\n[TOPIC]: health';
    setRoutes(routes);
    const res = await handler(
      request({
        prompt: 'Comment trouver un médecin de famille ?',
        platform: 'android',
        responseLanguage: 'fr-CA',
        stream: true,
      })
    );
    assertEquals(res.status, 200);
    const events = parseSse(await res.text());
    const metadata = events.find(([name]) => name === 'metadata')?.[1];
    assert(metadata, 'metadata event sent');
    assertEquals(metadata.queryType, 'immigration');
    // Sent before generation, so it cannot carry the model's label.
    assertEquals('topic' in metadata, false);

    const complete = events.find(([name]) => name === 'complete')?.[1];
    assert(complete, 'complete event sent');
    assertEquals(complete.topic, 'health');
    assertEquals(complete.cleanAnswer, 'Here is how it works.');

    const streamed = events
      .filter(([name]) => name === 'token')
      .map(([, data]) => data.delta)
      .join('');
    assertEquals(streamed, ANSWER + '\n');
    assertEquals(streamed.includes('[TOPIC]'), false);

    const generations = aiGenerationEvents();
    assertEquals(generations.length, 1);
    assertEquals(generations[0].platform, 'android');
    assertEquals(generations[0].topic, 'health');
    assertEquals(generations[0].feature, 'ai_companion');
  },
});
