import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * The server Supabase client from lib/supabase/server.ts, for a route whose
 * response might be stored in a shared cache. It also reports whether this
 * request wrote a session cookie, either here (a token refresh) or already in
 * `proxy.ts` (Next.js passes those along as `x-middleware-set-cookie`). A
 * response that sets a cookie must never be shared, so callers check
 * `wroteCookies()` before choosing a `Cache-Control`.
 */
export async function createCacheAwareClient(request: NextRequest) {
  const cookieStore = await cookies();
  let wroteCookies = request.headers.has("x-middleware-set-cookie");
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(cookiesToSet) {
          wroteCookies = true;
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        },
      },
    },
  );
  return { supabase, wroteCookies: () => wroteCookies };
}
