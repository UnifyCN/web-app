import { describe, expect, it } from "vitest";
import {
  scrubEmailDeep,
  scrubEmailProps,
  stripEmailParams,
} from "./scrubEmail";

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
    scrubEmailDeep(event);
    expect(event).toEqual({
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
});
