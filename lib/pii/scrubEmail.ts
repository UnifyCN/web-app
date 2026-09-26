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
 * Deep variant for nested payloads (Sentry events / breadcrumbs): returns a
 * scrubbed COPY with every reachable string passed through `stripEmailParams`.
 * It never mutates its input — Sentry payloads can carry getter-only or frozen
 * properties, and writing back into them threw (`Cannot set property $ … which
 * has only a getter`), which made Sentry drop the event.
 *
 * Arrays and plain objects are rebuilt (getter values are read and copied as
 * data). Non-plain objects (class instances such as Sentry scopes, Dates,
 * Errors) are returned by reference untouched: by the time Sentry's `before*`
 * hooks run, everything it serializes has already been normalized to plain
 * JSON, so no sent string lives inside them. Depth-capped so a pathological
 * payload can't blow the stack.
 */
export function scrubEmailDeep<T>(value: T, depth = 0): T {
  if (typeof value === "string") return stripEmailParams(value) as T;
  if (depth > 8 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((item) => scrubEmailDeep(item, depth + 1)) as T;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value;
  const record = value as Record<string, unknown>;
  const copy: Record<string, unknown> =
    proto === null ? Object.create(null) : {};
  for (const key of Object.keys(record)) {
    copy[key] = scrubEmailDeep(record[key], depth + 1);
  }
  return copy as T;
}
