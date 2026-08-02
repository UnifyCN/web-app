/**
 * In-app navigation history, for back links that should *pop* rather than push.
 *
 * A `<Link>` is always a forward navigation: it pushes a new history entry, so the browser
 * has nothing to restore and the destination lands at scroll 0. That is why the physical
 * Back button restores scroll on a list page while an in-app "back" link does not. To get
 * the same native restoration, the link has to call `router.back()` — but only when there
 * genuinely is an in-app entry to go back to, otherwise a deep link would pop the user out
 * of the app entirely.
 *
 * `window.history.length > 1` does not answer that: it is also >1 when the previous entry
 * belongs to another site. So this tracks the previous *in-app* pathname instead.
 *
 * Deliberately module scope rather than sessionStorage: module state is per document and
 * resets on a full page load, which is exactly the semantics wanted. A deep link, a shared
 * URL or a hard refresh all start with no previous route and correctly fall back to a real
 * navigation.
 */

let previousPathname: string | null = null;
let currentPathname: string | null = null;

/**
 * Record a client-side route change. Idempotent for the same path, so React's double-invoked
 * effects in development can't shift `previousPathname` onto the current route.
 */
export function recordPathname(pathname: string): void {
  if (pathname === currentPathname) return;
  previousPathname = currentPathname;
  currentPathname = pathname;
}

/** The route navigated *from*, or null when this document has no in-app history yet. */
export function getPreviousPathname(): string | null {
  return previousPathname;
}
