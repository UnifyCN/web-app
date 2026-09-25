import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";
import { config } from "./proxy";

const matches = (url: string) => unstable_doesMiddlewareMatch({ config, url });

describe("proxy matcher", () => {
  it.each(["/api/cron/sentry-snapshot", "/monitoring"])(
    "skips the auth proxy for %s",
    (url) => {
      expect(matches(url)).toBe(false);
    },
  );

  // The /api/cron/ exemption must not widen: everything else still hits the
  // proxy (and is redirected to /welcome when signed out).
  it.each([
    "/home",
    "/resume",
    "/cover-letter",
    "/api/cron",
    "/api/cronjob",
    "/api/companion",
    "/api/translate",
  ])("runs the auth proxy for %s", (url) => {
    expect(matches(url)).toBe(true);
  });
});
