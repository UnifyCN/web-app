import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const ONBOARDED_COOKIE = "unify_onboarded";
const CONSENTED_COOKIE = "unify_consented";

/**
 * Public auth routes — reachable while signed out, and bounced to /home when an
 * authenticated user lands on them. The consent gate (/before-you-continue) and
 * /onboarding are authenticated-only gate routes and are deliberately NOT here.
 */
const AUTH_PUBLIC_PATHS = new Set([
  "/welcome",
  "/login",
  "/signup",
  "/verify-email",
  "/forgot-password",
  "/reset-password",
]);

/** Options for the gate-hint cookies (1-year, httpOnly). */
function hintCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  };
}

/**
 * Build a redirect that preserves the Supabase auth cookies refreshed onto
 * `response` by getUser(). A bare NextResponse.redirect() is a fresh response
 * and would drop those cookies, intermittently signing the user out.
 */
function redirectTo(
  request: NextRequest,
  response: NextResponse,
  pathname: string,
): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  const redirect = NextResponse.redirect(url);
  for (const cookie of response.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }
  return redirect;
}

/**
 * Request proxy (the Next.js 16 successor to `middleware.ts`).
 *
 * Refreshes the Supabase session on every request, redirects unauthenticated
 * traffic to /welcome, then runs two authenticated gates in order: legal consent
 * (/before-you-continue) and onboarding (/onboarding). While the Supabase env
 * vars are unset (frontend-only / no backend yet) this passes through, so the
 * mock app stays browsable without a project configured.
 *
 * Both gates cache their "done" result in an httpOnly hint cookie keyed to the
 * user id, so the steady state costs only cookie reads — the `users` /
 * `user_onboarding_profiles` tables are queried just on a cookie miss (first
 * navigation, a new device, cleared cookies, or a different user on a shared
 * browser). They are UX gates, not security boundaries — RLS owns data access.
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

  // Signed out: clear the hint cookies and gate everything except the public
  // auth routes to /welcome.
  if (!user) {
    if (AUTH_PUBLIC_PATHS.has(pathname) || pathname.startsWith("/auth")) {
      return response;
    }
    const redirect = redirectTo(request, response, "/welcome");
    redirect.cookies.delete(ONBOARDED_COOKIE);
    redirect.cookies.delete(CONSENTED_COOKIE);
    return redirect;
  }

  // Signed in on a public auth route → into the app (the /home request then
  // runs the gates).
  if (AUTH_PUBLIC_PATHS.has(pathname)) {
    return redirectTo(request, response, "/home");
  }

  // OAuth callback and friends stay open; never gate them.
  if (pathname.startsWith("/auth")) {
    return response;
  }

  // ---- Legal-consent gate --------------------------------------------------
  const isConsentRoute = pathname === "/before-you-continue";

  let consented = request.cookies.get(CONSENTED_COOKIE)?.value === user.id;
  if (!consented) {
    const { data, error } = await supabase
      .from("users")
      .select("privacy_policy_accepted_at")
      .eq("id", user.id)
      .maybeSingle();
    if (error) {
      // Fail open: don't trap a user behind a transient error or a redirect
      // loop. Self-corrects on the next navigation.
      console.error("proxy: consent gate query failed", error);
      return response;
    }
    consented = Boolean(data?.privacy_policy_accepted_at);
    if (consented) {
      response.cookies.set(CONSENTED_COOKIE, user.id, hintCookieOptions());
    }
  }

  // Not consented: the consent gate is terminal. Render /before-you-continue
  // and return here — do NOT fall through to the onboarding gate below, which
  // would bounce an un-onboarded user to /onboarding and loop with this gate
  // (ERR_TOO_MANY_REDIRECTS).
  if (!consented) {
    if (isConsentRoute) return response;
    return redirectTo(request, response, "/before-you-continue");
  }

  // Consented but sitting on the gate → into the app.
  if (isConsentRoute) {
    const redirect = redirectTo(request, response, "/home");
    redirect.cookies.set(CONSENTED_COOKIE, user.id, hintCookieOptions());
    return redirect;
  }

  // ---- Onboarding gate -----------------------------------------------------
  const isOnboardingRoute = pathname === "/onboarding";

  let onboarded = request.cookies.get(ONBOARDED_COOKIE)?.value === user.id;
  if (!onboarded) {
    const { data, error } = await supabase
      .from("user_onboarding_profiles")
      .select("onboarding_completed")
      .eq("id", user.id)
      .maybeSingle();
    if (error) {
      // Fail open: don't trap an onboarded user behind a transient error or
      // risk a redirect loop. Self-corrects on the next navigation.
      console.error("proxy: onboarding gate query failed", error);
      return response;
    }
    // Gate on the explicit completion flag, not mere row existence: the shared
    // mobile DB has partially-onboarded rows (onboarding_completed=false, stage
    // NULL) that must still be routed through the web wizard. A missing row or a
    // NULL flag both read as not-onboarded.
    onboarded = data?.onboarding_completed === true;
    if (onboarded) {
      response.cookies.set(ONBOARDED_COOKIE, user.id, hintCookieOptions());
    }
  }

  // Onboarded users have no business on the wizard.
  if (isOnboardingRoute && onboarded) {
    const redirect = redirectTo(request, response, "/home");
    redirect.cookies.set(ONBOARDED_COOKIE, user.id, hintCookieOptions());
    return redirect;
  }

  // Un-onboarded users are sent to the wizard from any app route.
  if (!isOnboardingRoute && !onboarded) {
    return redirectTo(request, response, "/onboarding");
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static assets, image files, the
     * file-based metadata image routes (opengraph-image / twitter-image), and
     * the Sentry tunnel route (/monitoring). The metadata images are public
     * social-card assets fetched by unauthenticated crawlers, and the Sentry
     * tunnel receives unauthenticated POSTs from the browser SDK — neither must
     * be bounced through the /welcome auth gate.
     */
    "/((?!_next/static|_next/image|favicon.ico|opengraph-image|twitter-image|monitoring(?:/|$)|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
