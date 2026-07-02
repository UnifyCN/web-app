import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { ensureUserRow } from "@/lib/supabase/ensureUserRow";

/**
 * Only allow same-origin relative redirects (a single leading slash). Rejects
 * "//evil.com", "/\evil.com", and absolute URLs to prevent an open redirect via
 * a crafted `next` param.
 */
function sanitizeNext(next: string | null): string {
  if (
    !next ||
    !next.startsWith("/") ||
    next.startsWith("//") ||
    next.startsWith("/\\")
  ) {
    return "/home";
  }
  return next;
}

/**
 * Auth callback handler. Two flows land here:
 *  - PKCE `code` — OAuth sign-in, and (under @supabase/ssr) the email-change /
 *    recovery confirmation links → `exchangeCodeForSession`.
 *  - `token_hash` + `type` — classic email confirmation links → `verifyOtp`.
 * On success the session cookies are written by the server client and we
 * redirect into the app. An email change always returns to /settings with a
 * confirmation flag; everything else honours `next` (default /home).
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = sanitizeNext(searchParams.get("next"));

  const supabase = await createClient();

  let user = null;
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) user = data.user;
  } else if (tokenHash && type) {
    const { data, error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) user = data.user;
  }

  if (user) {
    // Ensure the public.users row exists, regardless of trigger timing. Stamp
    // signup_source 'web' for Google signups (guarded on null in ensureUserRow,
    // so returning logins / email-change confirmations never re-label).
    await ensureUserRow(supabase, user, undefined, "web");
    // An email change always lands back on settings with a confirmation, even
    // if `next` wasn't carried through the link (classic token_hash flow).
    const destination =
      type === "email_change" ? "/settings?emailChanged=1" : next;
    return NextResponse.redirect(`${origin}${destination}`);
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
