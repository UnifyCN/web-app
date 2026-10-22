// Platform tag on `$ai_generation` (spec UnifyCN/mobile-app#314, ticket #318).
//
// Clients now send a request-body field `platform` = ios | android | web. Old
// app builds send nothing (or only the legacy `source` tag), and they must keep
// today's value: `mobile` from shared functions, `web` from web-only ones.
//
// RUN (from web-app/):
//   deno test supabase/functions/_shared/platform_test.ts

import { assertEquals } from 'jsr:@std/assert@1';
import { resolvePlatform } from './platform.ts';

Deno.test('a valid request platform wins over the fallback', () => {
  assertEquals(resolvePlatform({ platform: 'ios' }, 'mobile'), 'ios');
  assertEquals(resolvePlatform({ platform: 'android' }, 'mobile'), 'android');
  assertEquals(resolvePlatform({ platform: 'web' }, 'mobile'), 'web');
  assertEquals(resolvePlatform({ platform: 'ios' }, 'web'), 'ios');
});

Deno.test('a valid request platform wins over the legacy source tag', () => {
  assertEquals(
    resolvePlatform({ platform: 'android', source: 'web' }, 'mobile'),
    'android'
  );
});

Deno.test('case and surrounding space in the request platform are ignored', () => {
  assertEquals(resolvePlatform({ platform: ' iOS ' }, 'mobile'), 'ios');
});

Deno.test('an old mobile build (no platform, no source) keeps "mobile"', () => {
  assertEquals(resolvePlatform({}, 'mobile'), 'mobile');
  assertEquals(resolvePlatform({ source: 'mobile' }, 'mobile'), 'mobile');
});

Deno.test('the legacy source:"web" tag still resolves to "web"', () => {
  assertEquals(resolvePlatform({ source: 'web' }, 'mobile'), 'web');
});

Deno.test('a web-only function falls back to "web"', () => {
  assertEquals(resolvePlatform({}, 'web'), 'web');
});

Deno.test('an unknown or non-string platform is ignored', () => {
  assertEquals(resolvePlatform({ platform: 'windows' }, 'mobile'), 'mobile');
  assertEquals(resolvePlatform({ platform: 'mobile' }, 'web'), 'web');
  assertEquals(resolvePlatform({ platform: 42 }, 'mobile'), 'mobile');
  assertEquals(
    resolvePlatform({ platform: 'windows', source: 'web' }, 'mobile'),
    'web'
  );
});

Deno.test('a missing or non-object body uses the fallback', () => {
  assertEquals(resolvePlatform(null, 'mobile'), 'mobile');
  assertEquals(resolvePlatform(undefined, 'web'), 'web');
  assertEquals(resolvePlatform('ios', 'mobile'), 'mobile');
});
