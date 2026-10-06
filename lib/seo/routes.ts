/**
 * Which pages search engines may read, for `app/robots.ts` and `app/sitemap.ts`.
 *
 * The app is behind sign-in: only the three entry pages are public. Everything
 * else either redirects a signed-out visitor to /welcome or is a step in the
 * sign-in flow that has no use in search results. `routes.test.ts` checks that
 * every route folder in `app/` is on one of the two lists, so a new section
 * cannot be left out by accident.
 */
export const SITE_URL = "https://app.unifysocial.ca";

/** Indexable, listed in the sitemap. */
export const PUBLIC_PAGES = ["/welcome", "/login", "/signup"] as const;

/** Not for crawlers: signed-in sections, sign-in flow steps, and the API. */
export const DISALLOWED_PREFIXES = [
  // Signed-in sections
  "/home",
  "/learn",
  "/checklist",
  "/companion",
  "/resume",
  "/cover-letter",
  "/community",
  "/resources",
  "/profile",
  "/settings",
  "/post",
  "/admin",
  "/onboarding",
  // Sign-in flow steps
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/before-you-continue",
  "/auth",
  // Server routes
  "/api",
] as const;
