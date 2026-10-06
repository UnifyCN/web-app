import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SHARED_IMAGE_CACHE_CONTROL } from "@/lib/supabase/imageCacheControl";

export const runtime = "nodejs";

/**
 * GET /api/storage/image/probe
 *
 * A temporary check, not a feature. It answers a signed-in request with a fixed,
 * harmless body and the exact cache header the image route would use if its
 * pictures were shared at the CDN. That lets one question be answered on
 * production before any real picture is cached there: once the CDN holds this
 * response, does a signed-out request get it?
 *
 * How to read it:
 * - Signed in, repeated: `x-vercel-cache: HIT` means the CDN is serving it.
 * - Then signed out, same URL: a redirect to /welcome means `proxy.ts` ran
 *   before the cache, so sharing pictures there keeps the sign-in check. A 200
 *   with this body means the cache answered first, and pictures must NOT be
 *   shared at the CDN.
 *
 * Delete this file once the image route's SHARE_AT_EDGE has been decided.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Not signed in" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json(
    { probe: "edge-cache", note: "No user data. Safe to cache." },
    { headers: { "Cache-Control": SHARED_IMAGE_CACHE_CONTROL } },
  );
}
