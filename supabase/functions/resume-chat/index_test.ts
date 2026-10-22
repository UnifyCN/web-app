// resume-chat handler: platform + feature on $ai_generation (spec
// UnifyCN/mobile-app#314, ticket #318). Web-only function: a request with no
// platform keeps today's value "web".
//
// RUN (from web-app/):
//   deno test --node-modules-dir=auto supabase/functions/resume-chat/index_test.ts

import { assertEquals } from 'jsr:@std/assert@1';
import {
  aiGenerationEvents,
  captureServe,
  openRouterCompletion,
  posthogRoute,
  setRoutes,
  supabaseRoute,
  type FetchCall,
} from '../_shared/testHarness.ts';

const takeHandler = captureServe();
await import('./index.ts');
const handler = takeHandler();

function routes(call: FetchCall): Response | undefined {
  return (
    supabaseRoute(call, { userId: 'user-1', rpc: { check_and_increment_resume_usage: true } }) ??
    (call.url.hostname === 'openrouter.ai'
      ? openRouterCompletion(JSON.stringify({ reply: 'Done.' }))
      : undefined) ??
    posthogRoute(call)
  );
}

async function chat(extra: Record<string, unknown>) {
  setRoutes(routes);
  await handler(
    new Request('http://localhost/resume-chat', {
      method: 'POST',
      headers: { Authorization: 'Bearer user-jwt', 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Make it shorter, please.', ...extra }),
    })
  );
  const events = aiGenerationEvents();
  assertEquals(events.length, 1, 'exactly one $ai_generation event');
  return events[0];
}

const opts = { sanitizeOps: false, sanitizeResources: false };

Deno.test({
  ...opts,
  name: 'the request platform goes on $ai_generation with feature resume_builder',
  fn: async () => {
    const event = await chat({ platform: 'android' });
    assertEquals(event.platform, 'android');
    assertEquals(event.feature, 'resume_builder');
  },
});

Deno.test({
  ...opts,
  name: 'the web proxy platform is "web"',
  fn: async () => {
    assertEquals((await chat({ platform: 'web' })).platform, 'web');
  },
});

Deno.test({
  ...opts,
  name: 'a request with no platform keeps "web"',
  fn: async () => {
    const event = await chat({});
    assertEquals(event.platform, 'web');
    assertEquals(event.feature, 'resume_builder');
  },
});
