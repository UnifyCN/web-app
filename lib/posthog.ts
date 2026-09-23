import posthog, { type CaptureResult } from "posthog-js";
import { scrubEmailProps } from "@/lib/pii/scrubEmail";

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

// Routes whose DOM is user-authored document content (resume / cover letter).
const CONTENT_ROUTE_PREFIXES = ["/resume", "/cover-letter"];

// Autocapture-family events carry `$el_text` / element chains from the DOM.
const DOM_CAPTURE_EVENTS = new Set([
  "$autocapture",
  "$rageclick",
  "$dead_click",
  "$copy_autocapture",
]);

function isContentRoute(url: unknown): boolean {
  if (typeof url !== "string") return false;
  try {
    const { pathname } = new URL(url, window.location.origin);
    return CONTENT_ROUTE_PREFIXES.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`),
    );
  } catch {
    return false;
  }
}

/**
 * Last-line PII scrub before any event leaves the browser:
 * - strips `?email=` from every string property (covers `$current_url`,
 *   `$referrer`, and the `$initial_*` / `$session_entry_*` variants), including
 *   person properties set via `$set` / `$set_once`;
 * - drops autocapture-family events on the resume + cover-letter routes. The
 *   route layouts already mark the page `ph-no-capture`; this also covers UI
 *   portaled to <body> (modals, menus), which escapes that container.
 */
function scrubEvent(event: CaptureResult | null): CaptureResult | null {
  if (!event) return event;
  if (
    DOM_CAPTURE_EVENTS.has(event.event) &&
    isContentRoute(event.properties?.$current_url)
  ) {
    return null;
  }
  scrubEmailProps(event.properties);
  scrubEmailProps(event.$set);
  scrubEmailProps(event.$set_once);
  return event;
}

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
    // Session recording is off by default everywhere; it's started/stopped
    // per-route in PostHogProvider so only the resume + cover-letter features
    // are recorded (Savar asked to see how those two are actually used).
    disable_session_recording: true,
    session_recording: {
      // The resume / cover-letter previews render as plain text, not inputs, so
      // input masking alone recorded full documents. Mask every text node.
      maskTextSelector: "*",
      maskAllInputs: true,
      // rrweb's default block class is `ph-no-capture`, which the feature layouts
      // use to stop autocapture. Point blocking at a different class so those
      // pages still record (layout + interactions, text masked) instead of
      // rendering as one blocked box.
      blockClass: "ph-no-record",
    },
    before_send: scrubEvent,
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
