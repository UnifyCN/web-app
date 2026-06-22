// Next.js server-side instrumentation hook. Loads the Sentry init for whichever
// runtime is executing, and forwards request errors to Sentry.
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Captures all unhandled server-side request errors (requires @sentry/nextjs
// >= 8.28.0).
export const onRequestError = Sentry.captureRequestError;
