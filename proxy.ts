import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const ONBOARDED_COOKIE = "unify_onboarded";

/** Options for the onboarding-status hint cookie (1-year, httpOnly). */
function onboardedCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  };
}

/**
 * Request proxy (the Next.js 16 successor to `middleware.ts`).
 *
 * Refreshes the Supabase session on every request, redirects unauthenticated
 * traffic to /login, and gates authenticated-but-un-onboarded users into
 * /onboarding. While the Supabase env vars are unset (frontend-only / no
 * backend yet) this passes through, so the mock app stays browsable without a
 * project configured.
 *
 * Onboarding gate: an httpOnly `unify_onboarded=<user.id>` cookie caches the
 * "has an onboarding row" result, so the steady state costs only a cookie
 * read — the `user_onboarding_profiles` table is queried just on a cookie miss
 * (first navigation after onboarding, a new device, cleared cookies, or a
 * different user on a shared browser). It is a UX gate, not a security boundary
 * — RLS owns data access — so trusting a client-readable hint is acceptable.
 */
export async function proxy(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Signed out: clear the onboarding hint and gate everything except the auth
  // routes to /login.
  if (!user) {
    if (pathname === "/login" || pathname.startsWith("/auth")) {
      return response;
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    const redirect = NextResponse.redirect(url);
    redirect.cookies.delete(ONBOARDED_COOKIE);
    return redirect;
  }

  // Signed in on /login → into the app (the /home request then runs the gate).
  if (pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/home";
    return NextResponse.redirect(url);
  }

  // OAuth callback and friends stay open; never gate them.
  if (pathname.startsWith("/auth")) {
    return response;
  }

  // ---- Onboarding gate -----------------------------------------------------
  const isOnboardingRoute = pathname === "/onboarding";

  let onboarded = request.cookies.get(ONBOARDED_COOKIE)?.value === user.id;
  if (!onboarded) {
    const { data, error } = await supabase
      .from("user_onboarding_profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();
    if (error) {
      // Fail open: don't trap an onboarded user behind a transient error or
      // risk a redirect loop. Self-corrects on the next navigation.
      console.error("proxy: onboarding gate query failed", error);
      return response;
    }
    onboarded = Boolean(data);
    if (onboarded) {
      response.cookies.set(ONBOARDED_COOKIE, user.id, onboardedCookieOptions());
    }
  }

  // Onboarded users have no business on the wizard.
  if (isOnboardingRoute && onboarded) {
    const url = request.nextUrl.clone();
    url.pathname = "/home";
    const redirect = NextResponse.redirect(url);
    redirect.cookies.set(ONBOARDED_COOKIE, user.id, onboardedCookieOptions());
    return redirect;
  }

  // Un-onboarded users are sent to the wizard from any app route.
  if (!isOnboardingRoute && !onboarded) {
    const url = request.nextUrl.clone();
    url.pathname = "/onboarding";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static assets and image files.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
