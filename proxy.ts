import { NextResponse, type NextRequest } from "next/server";

/**
 * Request proxy (the Next.js 16 successor to `middleware.ts`).
 *
 * TODO: replace with real data — frontend-only build. This is a passthrough;
 * Supabase session refresh and the unauthenticated -> /login redirect get
 * wired up during backend integration.
 */
export function proxy(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static assets and image files.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
