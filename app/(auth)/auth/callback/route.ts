import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureUserRow } from "@/lib/supabase/ensureUserRow";

/**
 * Only allow same-origin relative redirects (a single leading slash). Rejects
 * "//evil.com", "/\evil.com", and absolute URLs to prevent an open redirect via
 * a crafted `next` param.
 */
function sanitizeNext(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return "/home";
  }
  return next;
}

/**
 * OAuth callback handler — exchanges the `code` returned by the provider for a
 * session (cookies are written by the server client), then redirects into the app.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = sanitizeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      // Ensure the public.users row exists, regardless of trigger timing.
      await ensureUserRow(supabase, data.user);
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
