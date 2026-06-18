import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Server-side proxy for the `public-onboarding-profile` edge function.
 *
 * That function (mobile-owned, on the shared project) serves the public-facing
 * onboarding fields (persona / persona_other / arrival_date) cross-user, but it
 * ships no CORS headers and doesn't answer the OPTIONS preflight — so a browser
 * call via `supabase.functions.invoke` is rejected and the other-user profile's
 * persona/stage badges silently never render. The browser instead POSTs here,
 * and the route does a server→server `functions.invoke` (no preflight) while
 * forwarding the user's JWT (from cookies), which the function requires
 * (verify_jwt). Mirrors /api/companion + /api/moderation (Node runtime).
 */
export const runtime = "nodejs";
export const maxDuration = 10;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { userId?: unknown };
  try {
    body = (await req.json()) as { userId?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body?.userId || typeof body.userId !== "string") {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const { data, error } = await supabase.functions.invoke("public-onboarding-profile", {
    body: { userId: body.userId },
  });

  if (error) {
    let status = 502;
    let message = error.message || "Profile request failed.";
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.status === "number") {
      status = ctx.status;
      if (typeof ctx.json === "function") {
        try {
          const j = (await ctx.json()) as { error?: string };
          if (j?.error) message = j.error;
        } catch {
          // non-JSON error body — keep the generic message
        }
      }
    }
    return NextResponse.json({ error: message }, { status });
  }

  // The function returns application/json, so supabase-js hands `data` back
  // parsed; guard the string case defensively.
  let result: unknown = data;
  if (typeof data === "string") {
    try {
      result = JSON.parse(data);
    } catch {
      result = { profile: null };
    }
  }
  return NextResponse.json(result ?? { profile: null });
}
