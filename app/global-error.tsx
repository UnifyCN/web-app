"use client";

// Root error boundary — catches errors in the root layout and otherwise
// uncaught React render errors, and reports them to Sentry. (This is the SDK's
// error-capture boundary, not the optional /sentry-example-page demo.)
import * as Sentry from "@sentry/nextjs";
import NextError from "next/error";
import { useEffect } from "react";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
