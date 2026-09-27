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
 * Shared computers (libraries, settlement centres) matter here: the value is
 * cleared on sign-out (`services/auth.ts#signOut`) and once verification /
 * reset succeeds, and it expires after an hour (Supabase's code lifetime) so an
 * abandoned flow doesn't leave the address for the next person in that tab.
 * Note a browser copies sessionStorage into tabs opened FROM this tab
 * (Cmd-click, duplicate) — a separately opened tab starts empty.
 *
 * Every accessor tolerates storage being unavailable (private mode, blocked
 * storage): callers then get "" and the page falls back to asking for the email.
 */
export type AuthEmailFlow = "verify" | "reset";

const FLOWS: AuthEmailFlow[] = ["verify", "reset"];
const storageKey = (flow: AuthEmailFlow) => `unify_auth_email:${flow}`;
/** Matches Supabase's default OTP lifetime; older hand-offs are discarded. */
export const AUTH_EMAIL_TTL_MS = 60 * 60 * 1000;

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
    storage()?.setItem(
      storageKey(flow),
      JSON.stringify({ email, at: Date.now() }),
    );
  } catch {
    // Storage full or blocked: the next screen asks for the email instead.
  }
}

/** The email handed over for `flow`, or "" when there is none or it expired. */
export function readAuthEmail(flow: AuthEmailFlow): string {
  let raw: string | null | undefined;
  try {
    raw = storage()?.getItem(storageKey(flow));
  } catch {
    return "";
  }
  if (!raw) return "";
  try {
    const { email, at } = JSON.parse(raw) as { email?: unknown; at?: unknown };
    if (
      typeof email === "string" &&
      typeof at === "number" &&
      Date.now() - at < AUTH_EMAIL_TTL_MS
    ) {
      return email;
    }
  } catch {
    // Malformed value: treat as absent.
  }
  clearAuthEmail(flow);
  return "";
}

/** Forget the email once verification / reset has succeeded. */
export function clearAuthEmail(flow: AuthEmailFlow): void {
  try {
    storage()?.removeItem(storageKey(flow));
  } catch {
    // Nothing to clear.
  }
}

/** Forget every handed-over email (sign-out). */
export function clearAllAuthEmails(): void {
  for (const flow of FLOWS) clearAuthEmail(flow);
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
    // Pass `null`, not `history.state`: Next.js patches replaceState and only
    // syncs its router URL for calls WITHOUT its internal markers (`__NA`).
    // Handing it `history.state` made Next treat this as its own call, keep
    // the old URL internally, and restore `?email=` on the next router sync.
    window.history.replaceState(null, "", pathname + clean + hash);
    return fromUrl;
  }
  return readAuthEmail(flow);
}
