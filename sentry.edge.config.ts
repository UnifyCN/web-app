// Sentry edge runtime init (middleware / edge route handlers). Imported by
// instrumentation.ts when NEXT_RUNTIME === "edge".
import * as Sentry from "@sentry/nextjs";
import { sentryPiiHooks } from "@/lib/pii/sentryScrub";

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  // Privacy-conservative: no IP / request headers / cookies.
  sendDefaultPii: false,

  // Strip `?email=` (the /verify-email + /reset-password hand-offs) from events,
  // transactions and breadcrumbs.
  ...sentryPiiHooks,

  // 100% sampling in dev, 10% in production.
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  enableLogs: true,
});
