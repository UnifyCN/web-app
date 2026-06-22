// Sentry Node.js server runtime init. Imported by instrumentation.ts when
// NEXT_RUNTIME === "nodejs".
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  // Privacy-conservative: no IP / request headers / cookies.
  sendDefaultPii: false,

  // 100% sampling in dev, 10% in production.
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  // Attach local variable values to stack frames for richer server traces.
  includeLocalVariables: true,

  enableLogs: true,
});
