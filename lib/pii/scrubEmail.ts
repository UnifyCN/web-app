/**
 * Strip `email=` query params from URL-ish strings before they reach analytics
 * or error tracking. The signup/login → /verify-email and forgot-password →
 * /reset-password hand-offs put the address in `?email=`, so it would otherwise
 * ride along in PostHog `$current_url` / `$referrer` and Sentry request URLs,
 * transaction names and navigation breadcrumbs.
 *
 * Framework-free and side-effect-free so it runs in the browser, Node and edge
 * runtimes, and is unit-tested in `scrubEmail.test.ts`.
 */

// `email=` as a whole param name: at the start of a bare query string, or after
// `?` / `&`. The value runs to the next `&`, `#`, whitespace or quote, so
// URL-encoded (`%40`) and raw (`@`) addresses are both covered. A trailing `&`
// is captured so the surrounding params can be re-joined cleanly.
const EMAIL_PARAM = /(^|[?&])email=[^&#\s"']*(&?)/gi;

/** Remove every `email=` param from a URL, path or query string. */
export function stripEmailParams(value: string): string {
  if (!/email=/i.test(value)) return value;
  // `?email=a&b=1` → `?b=1`; `?b=1&email=a&c=2` → `?b=1&c=2`;
  // `?b=1&email=a` → `?b=1`; `?email=a` → `` (drops the dangling `?`).
  // Repeat until stable: a match consumes its trailing `&`, so an immediately
  // following `email=` has no separator left to anchor on in the same pass.
  let prev: string;
  let next = value;
  do {
    prev = next;
    next = prev.replace(EMAIL_PARAM, (_match, sep: string, amp: string) =>
      amp ? sep : "",
    );
  } while (next !== prev);
  return next;
}

/** Scrub the string values of a flat property bag in place. */
export function scrubEmailProps(props: Record<string, unknown> | undefined) {
  if (!props) return;
  for (const [key, value] of Object.entries(props)) {
    if (typeof value === "string") props[key] = stripEmailParams(value);
  }
}

/**
 * Deep variant for nested payloads (Sentry events / breadcrumbs): scrubs every
 * string reachable from `value` in place and returns the (possibly replaced)
 * value. Depth-capped so a pathological payload can't blow the stack.
 */
export function scrubEmailDeep<T>(value: T, depth = 0): T {
  if (typeof value === "string") return stripEmailParams(value) as T;
  if (depth > 8 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      value[i] = scrubEmailDeep(value[i], depth + 1);
    }
    return value;
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    record[key] = scrubEmailDeep(record[key], depth + 1);
  }
  return value;
}
