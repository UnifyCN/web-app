// Sentry edge runtime init (middleware / edge route handlers). Imported by
// instrumentation.ts when NEXT_RUNTIME === "edge".
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  // Privacy-conservative: no IP / request headers / cookies.
  sendDefaultPii: false,

  // 100% sampling in dev, 10% in production.
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  enableLogs: true,
});
