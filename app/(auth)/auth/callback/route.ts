import { NextResponse } from "next/server";

/**
 * OAuth callback handler.
 *
 * TODO: replace with real data — once Supabase auth is wired, exchange the
 * `code` query param for a session here, then redirect. For the frontend-only
 * build this simply returns to the app.
 */
export function GET(request: Request) {
  const { origin } = new URL(request.url);
  return NextResponse.redirect(`${origin}/home`);
}
