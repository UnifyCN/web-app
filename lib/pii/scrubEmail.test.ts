import { describe, expect, it } from "vitest";
import {
  scrubEmailDeep,
  scrubEmailProps,
  stripEmailParams,
} from "./scrubEmail";
import { sentryPiiHooks } from "./sentryScrub";

describe("stripEmailParams", () => {
  it("strips a plain email as the only param", () => {
    expect(
      stripEmailParams("https://app.unifysocial.ca/verify-email?email=a@b.co"),
    ).toBe("https://app.unifysocial.ca/verify-email");
  });

  it("strips a URL-encoded (%40) email", () => {
    expect(
      stripEmailParams(
        "https://app.unifysocial.ca/verify-email?email=jane.doe%40example.com",
      ),
    ).toBe("https://app.unifysocial.ca/verify-email");
  });

  it("strips email= mid-query, keeping params before and after", () => {
    expect(
      stripEmailParams("/reset-password?lang=fr&email=a%40b.co&step=2#top"),
    ).toBe("/reset-password?lang=fr&step=2#top");
  });

  it("strips email= as the first of several params", () => {
    expect(stripEmailParams("/verify-email?email=a%40b.co&next=%2Fhome")).toBe(
      "/verify-email?next=%2Fhome",
    );
  });

  it("strips email= as the last param", () => {
    expect(stripEmailParams("/verify-email?next=%2Fhome&email=a@b.co")).toBe(
      "/verify-email?next=%2Fhome",
    );
  });

  it("keeps a fragment when email= is the only param", () => {
    expect(stripEmailParams("/verify-email?email=a@b.co#code")).toBe(
      "/verify-email#code",
    );
  });

  it("strips email= from a bare query string (Sentry query_string)", () => {
    expect(stripEmailParams("email=a%40b.co&lang=es")).toBe("lang=es");
    expect(stripEmailParams("email=a%40b.co")).toBe("");
  });

  it("strips repeated email params and is case-insensitive", () => {
    expect(stripEmailParams("/x?Email=a@b.co&y=1&email=c@d.co")).toBe("/x?y=1");
  });

  it("strips back-to-back email params", () => {
    expect(stripEmailParams("/x?email=a@b.co&email=c@d.co&y=1")).toBe("/x?y=1");
  });

  it("leaves params that merely end in 'email' alone", () => {
    expect(stripEmailParams("/x?user_email=a@b.co&y=1")).toBe(
      "/x?user_email=a@b.co&y=1",
    );
  });

  it("returns strings without email= unchanged", () => {
    const url = "https://app.unifysocial.ca/home?tab=following";
    expect(stripEmailParams(url)).toBe(url);
    expect(stripEmailParams("Verify your email")).toBe("Verify your email");
  });
});

describe("scrubEmailProps", () => {
  it("scrubs URL properties and leaves unrelated properties untouched", () => {
    const props: Record<string, unknown> = {
      $current_url: "https://app.unifysocial.ca/verify-email?email=a%40b.co",
      $referrer: "https://app.unifysocial.ca/signup?email=a@b.co&ref=nav",
      $pathname: "/verify-email",
      platform: "web",
      title: "Check your email",
      step_number: 3,
      is_reply: false,
      tags: ["email=a@b.co"],
    };
    scrubEmailProps(props);
    expect(props).toEqual({
      $current_url: "https://app.unifysocial.ca/verify-email",
      $referrer: "https://app.unifysocial.ca/signup?ref=nav",
      $pathname: "/verify-email",
      platform: "web",
      title: "Check your email",
      step_number: 3,
      is_reply: false,
      // Flat scrub only touches top-level strings (PostHog props are flat).
      tags: ["email=a@b.co"],
    });
  });

  it("tolerates an undefined bag", () => {
    expect(() => scrubEmailProps(undefined)).not.toThrow();
  });
});

describe("scrubEmailDeep", () => {
  it("scrubs nested strings in a Sentry-shaped event", () => {
    const event = {
      transaction: "/verify-email?email=a%40b.co",
      request: {
        url: "https://app.unifysocial.ca/verify-email?email=a%40b.co",
        query_string: "email=a%40b.co&lang=vi",
      },
      breadcrumbs: [
        {
          category: "navigation",
          data: { from: "/signup", to: "/verify-email?email=a@b.co" },
        },
      ],
      level: "error",
      extra: { attempts: 2 },
    };
    const original = structuredClone(event);
    const scrubbed = scrubEmailDeep(event);
    // Returns a scrubbed copy and leaves the input untouched.
    expect(event).toEqual(original);
    expect(scrubbed).toEqual({
      transaction: "/verify-email",
      request: {
        url: "https://app.unifysocial.ca/verify-email",
        query_string: "lang=vi",
      },
      breadcrumbs: [
        {
          category: "navigation",
          data: { from: "/signup", to: "/verify-email" },
        },
      ],
      level: "error",
      extra: { attempts: 2 },
    });
  });

  it("returns a scrubbed string for a string input", () => {
    expect(scrubEmailDeep("/x?email=a@b.co")).toBe("/x");
  });

  it("copies getter-only properties instead of writing into them", () => {
    const withGetter = {};
    Object.defineProperty(withGetter, "$", {
      enumerable: true,
      get: () => "/verify-email?email=a@b.co",
    });
    let scrubbed: Record<string, unknown> = {};
    expect(() => {
      scrubbed = scrubEmailDeep(withGetter) as Record<string, unknown>;
    }).not.toThrow();
    expect(scrubbed).toEqual({ $: "/verify-email" });
    expect((withGetter as { $: string }).$).toBe("/verify-email?email=a@b.co");
  });

  it("handles a getter-only $ nested deep in a transaction (the prod shape)", () => {
    const leaf = {};
    Object.defineProperty(leaf, "$", {
      enumerable: true,
      get: () => "https://app.unifysocial.ca/reset-password?email=a%40b.co",
    });
    const transaction = {
      type: "transaction",
      transaction: "/reset-password?email=a%40b.co",
      sdkProcessingMetadata: { a: { b: { c: { d: leaf } } } },
    };
    const scrubbed = scrubEmailDeep(transaction);
    expect(scrubbed.transaction).toBe("/reset-password");
    expect(scrubbed.sdkProcessingMetadata.a.b.c.d).toEqual({
      $: "https://app.unifysocial.ca/reset-password",
    });
  });

  it("scrubs frozen objects and arrays without throwing", () => {
    const frozen = Object.freeze({
      url: "/verify-email?email=a@b.co",
      crumbs: Object.freeze(["/verify-email?email=a@b.co"]),
    });
    expect(scrubEmailDeep(frozen)).toEqual({
      url: "/verify-email",
      crumbs: ["/verify-email"],
    });
  });

  it("returns class instances by reference, untouched", () => {
    class ScopeLike {
      url = "/verify-email?email=a@b.co";
    }
    const scope = new ScopeLike();
    const scrubbed = scrubEmailDeep({ capturedSpanScope: scope });
    expect(scrubbed.capturedSpanScope).toBe(scope);
    expect(scope.url).toBe("/verify-email?email=a@b.co");
  });
});

describe("sentryPiiHooks", () => {
  it("strips emails from error events", () => {
    const event = sentryPiiHooks.beforeSend({
      request: {
        url: "https://app.unifysocial.ca/verify-email?email=a%40b.co",
      },
      breadcrumbs: [{ data: { to: "/verify-email?email=a@b.co" } }],
    });
    expect(event.request.url).toBe("https://app.unifysocial.ca/verify-email");
    expect(event.breadcrumbs[0].data.to).toBe("/verify-email");
  });

  it("strips emails from transactions, including the envelope DSC", () => {
    const tx = sentryPiiHooks.beforeSendTransaction({
      type: "transaction",
      transaction: "/verify-email?email=a%40b.co",
      request: {
        url: "https://app.unifysocial.ca/verify-email?email=a%40b.co",
      },
      sdkProcessingMetadata: {
        dynamicSamplingContext: { transaction: "/verify-email?email=a%40b.co" },
      },
    });
    expect(tx.transaction).toBe("/verify-email");
    expect(tx.request.url).toBe("https://app.unifysocial.ca/verify-email");
    expect(tx.sdkProcessingMetadata.dynamicSamplingContext.transaction).toBe(
      "/verify-email",
    );
  });

  it("strips emails from breadcrumbs", () => {
    const crumb = sentryPiiHooks.beforeBreadcrumb({
      category: "navigation",
      data: { from: "/signup", to: "/verify-email?email=a@b.co" },
    });
    expect(crumb.data).toEqual({ from: "/signup", to: "/verify-email" });
  });
});
