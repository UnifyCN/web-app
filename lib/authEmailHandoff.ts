import { stripEmailParams } from "@/lib/pii/scrubEmail";

/**
 * Hands the user's email from signup / login / forgot-password to
 * /verify-email and /reset-password WITHOUT putting it in the URL.
 *
 * It used to ride along as `?email=`, so the address landed in browser history,
 * `document.referrer`, server and proxy logs, and anything that records the URL
 * (Sentry Replay's page `href`, which no SDK hook can scrub). Now it lives in
 * `sessionStorage`, scoped to this tab.
 *
 * Every accessor tolerates storage being unavailable (private mode, blocked
 * storage): callers then get "" and the page falls back to asking for the email.
 */
export type AuthEmailFlow = "verify" | "reset";

const storageKey = (flow: AuthEmailFlow) => `unify_auth_email:${flow}`;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** Remember the email for the next auth screen in this tab. */
export function storeAuthEmail(flow: AuthEmailFlow, email: string): void {
  try {
    storage()?.setItem(storageKey(flow), email);
  } catch {
    // Storage full or blocked: the next screen asks for the email instead.
  }
}

/** The email handed over for `flow`, or "" when there is none. */
export function readAuthEmail(flow: AuthEmailFlow): string {
  try {
    return storage()?.getItem(storageKey(flow)) ?? "";
  } catch {
    return "";
  }
}

/** Forget the email once verification / reset has succeeded. */
export function clearAuthEmail(flow: AuthEmailFlow): void {
  try {
    storage()?.removeItem(storageKey(flow));
  } catch {
    // Nothing to clear.
  }
}

/**
 * Resolve the email for `flow` on page load. Old links still carry `?email=`:
 * read it once, move it into storage, and strip it from the address bar with
 * `history.replaceState` (other params and the hash are kept). Otherwise fall
 * back to what signup / login / forgot-password stored.
 */
export function takeAuthEmail(flow: AuthEmailFlow): string {
  if (typeof window === "undefined") return "";
  const { pathname, search, hash } = window.location;
  const fromUrl = new URLSearchParams(search).get("email")?.trim() ?? "";
  if (fromUrl) {
    storeAuthEmail(flow, fromUrl);
    const clean = stripEmailParams(search);
    window.history.replaceState(
      window.history.state,
      "",
      pathname + clean + hash,
    );
    return fromUrl;
  }
  return readAuthEmail(flow);
}
