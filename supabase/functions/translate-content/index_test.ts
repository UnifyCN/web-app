// translate-content handler: platform + feature on $ai_generation (spec
// UnifyCN/mobile-app#314, ticket #318). Both apps call this function, so an old
// mobile build that sends no platform keeps the value "mobile".
//
// RUN (from web-app/):
//   deno test --node-modules-dir=auto supabase/functions/translate-content/index_test.ts

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
    supabaseRoute(call, {
      userId: 'user-1',
      rpc: { check_and_increment_translation_usage: true },
      tables: { posts: [{ id: 7, title: 'Hello', content: 'Welcome to Unify' }] },
    }) ??
    (call.url.hostname === 'openrouter.ai'
      ? openRouterCompletion(
          JSON.stringify({
            sourceLang: 'en',
            translatedTitle: 'Xin chào',
            translatedContent: 'Chào mừng đến với Unify',
          })
        )
      : undefined) ??
    posthogRoute(call)
  );
}

async function translate(extra: Record<string, unknown>) {
  setRoutes(routes);
  const res = await handler(
    new Request('http://localhost/translate-content', {
      method: 'POST',
      headers: { Authorization: 'Bearer user-jwt', 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'post', id: 7, targetLanguage: 'vi', ...extra }),
    })
  );
  assertEquals(res.status, 200);
  const events = aiGenerationEvents();
  assertEquals(events.length, 1, 'exactly one $ai_generation event');
  return events[0];
}

const opts = { sanitizeOps: false, sanitizeResources: false };

Deno.test({
  ...opts,
  name: 'the request platform goes on $ai_generation with feature translate_content',
  fn: async () => {
    const event = await translate({ platform: 'android' });
    assertEquals(event.platform, 'android');
    assertEquals(event.feature, 'translate_content');
  },
});

Deno.test({
  ...opts,
  name: 'the web proxy platform is "web"',
  fn: async () => {
    assertEquals((await translate({ platform: 'web' })).platform, 'web');
  },
});

Deno.test({
  ...opts,
  name: 'an old mobile build (no platform) gets "mobile"',
  fn: async () => {
    const event = await translate({});
    assertEquals(event.platform, 'mobile');
    assertEquals(event.feature, 'translate_content');
  },
});
