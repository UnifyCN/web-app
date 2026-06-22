import posthog from "posthog-js";

/** True once the PostHog env vars are populated. Mirrors `isSupabaseConfigured()`. */
export function isPostHogConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_POSTHOG_KEY && process.env.NEXT_PUBLIC_POSTHOG_HOST,
  );
}

// Tagged onto every captured event as a super property so the shared PostHog
// project (web + mobile on one project) can be filtered by platform. `reset()`
// clears super properties, so it is re-registered in `resetPostHog()`.
const DEFAULT_PROPERTIES = { platform: "web" } as const;

let initialized = false;

/**
 * Initialize the browser PostHog client once. No-op on the server and while the
 * env vars are unset (local dev / preview without analytics), so the app stays
 * runnable without a PostHog project — same guard convention as the Supabase
 * services layer.
 */
export function initPostHog() {
  if (initialized || typeof window === "undefined" || !isPostHogConfigured()) {
    return;
  }
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY as string, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    // App Router has no full page loads after the first, so the built-in
    // pageview listener would miss client-side navigations. We capture
    // `$pageview` manually on route change (see PostHogProvider).
    capture_pageview: false,
    capture_pageleave: true,
  });
  posthog.register(DEFAULT_PROPERTIES);
  initialized = true;
}

/**
 * Clear the identified user on sign-out, then restore the `platform` super
 * property (`reset()` wipes super properties along with the identity).
 */
export function resetPostHog() {
  posthog.reset();
  posthog.register(DEFAULT_PROPERTIES);
}

export { posthog };
