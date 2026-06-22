// Sentry browser/client runtime init. Loaded by Next.js for the client bundle.
// The current SDK convention is `instrumentation-client.ts` (formerly
// `sentry.client.config.ts`).
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  // Public DSN — must be NEXT_PUBLIC_* to reach the browser bundle. Add it to
  // .env.local (same value as SENTRY_DSN); without it client capture no-ops.
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Privacy-conservative: do not attach IP / request headers / cookies. Suits
  // Unify's newcomer/refugee userbase (mirrors the PostHog no-PII stance).
  sendDefaultPii: false,

  // 100% sampling in dev, 10% in production.
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  // Session Replay: 10% of all sessions, 100% of sessions with an error.
  // replayIntegration() masks all text/inputs and blocks media by default.
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  enableLogs: true,

  integrations: [Sentry.replayIntegration()],
});

// Instruments App Router navigation transitions as spans.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
