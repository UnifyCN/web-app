/**
 * Platform tag for the `$ai_generation` analytics event.
 *
 * Clients send a request-body field `platform`: the mobile app sends `ios` or
 * `android` (from `Platform.OS`), the web app's server proxies send `web`. Old
 * app builds send nothing, or only the legacy `source: 'web'` tag, so they keep
 * the value they had before: `fallback` is `'mobile'` for functions that old
 * mobile builds call and `'web'` for web-only functions.
 *
 * Analytics only: the value is never used for auth or routing, and anything
 * outside the fixed list is ignored, so a caller cannot inject free text.
 */

export const AI_PLATFORMS = ['ios', 'android', 'web'] as const;

export type AiPlatform = (typeof AI_PLATFORMS)[number];

/** `mobile` is the legacy value for an old app build that sends no platform. */
export type ResolvedPlatform = AiPlatform | 'mobile';

function isAiPlatform(value: string): value is AiPlatform {
  return (AI_PLATFORMS as readonly string[]).includes(value);
}

export function resolvePlatform(
  body: unknown,
  fallback: 'mobile' | 'web'
): ResolvedPlatform {
  if (!body || typeof body !== 'object') return fallback;
  const { platform, source } = body as { platform?: unknown; source?: unknown };

  if (typeof platform === 'string') {
    const normalized = platform.trim().toLowerCase();
    if (isAiPlatform(normalized)) return normalized;
  }
  if (source === 'web') return 'web';
  return fallback;
}
